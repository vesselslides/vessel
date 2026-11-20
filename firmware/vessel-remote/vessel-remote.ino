// Vessel Remote: buttons that drive Vessel, over Wi-Fi or as a USB MIDI device.
//
// Board: ESP32-S3. Build and flash with ./build.sh (see README.md): USB runs in
// OTG (TinyUSB) mode so the board shows up as both a MIDI device ("Vessel
// Remote") and a serial port for settings.
//
// Settings are typed into a serial monitor (115200 baud). Type `help`.

#include <Arduino.h>
#if ARDUINO_USB_MODE
#error "Build with USBMode=default (USB-OTG / TinyUSB) so the board can be a MIDI device."
#endif

#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include "USB.h"
#include "USBMIDI.h"
#include <ArduinoJson.h>  // live.ino (included here so its functions can be declared early)
#include <JPEGDEC.h>  // pictures.ino, likewise

#define FIRMWARE_VERSION "2.1.0"

// The board. 1 for the Guition JC3248W535 (3.5" touch screen, see display.ino);
// 0 for a bare ESP32-S3 with buttons and an RGB light.
#define BOARD_JC3248W535 1

#if BOARD_JC3248W535
// Screen (QSPI 45/47/21/48/40/39), backlight (1), touch (I2C 4/8, interrupt 3), USB (19/20).
// Also the speaker amplifier (I2S 2/41/42), the battery sense (5) and the SD card (10-13).
const int RESERVED_PINS[] = {1, 2, 3, 4, 5, 8, 10, 11, 12, 13, 19, 20, 21, 39, 40, 41, 42, 45, 47, 48};
#define DEFAULT_LED_PIN -1  // this board has no RGB light; the screen shows the status
#else
const int RESERVED_PINS[] = {19, 20};  // USB
#define DEFAULT_LED_PIN 48
#endif

#include "ui.h"

// From display.ino, live.ino, pages.ino, pictures.ino and audio.ino (empty when there's no screen).
void audioBegin();
void picturesBegin();
bool audioConsole(String *t, int n);
void screenBegin();
void screenLoop();
void screenBacklight();
bool screenConsole(String *t, int n);
void liveLoop();
void liveReset();
void printLive();
extern bool touchLog;

bool pinReserved(int p) {
  for (int r : RESERVED_PINS)
    if (r == p) return true;
  return false;
}

USBMIDI MIDI("Vessel Remote");
USBCDC Console;  // the settings console (USB serial)
Preferences prefs;

// ---- Actions (the same list as Vessel's src/shared/control.ts) -------------

const char *const ACTIONS[] = {"next", "prev", "clear", "clear-media", "clear-all", "black",
                               "logo", "video", "timer", "timer-reset", "hide-message", "hide-lower-third"};
const int ACTION_COUNT = sizeof(ACTIONS) / sizeof(ACTIONS[0]);

bool isAction(const String &a) {
  for (int i = 0; i < ACTION_COUNT; i++)
    if (a == ACTIONS[i]) return true;
  return false;
}

// ---- Settings ---------------------------------------------------------------

const int MAX_BUTTONS = 8;
const uint32_t HOLD_MS = 600;
const uint32_t DEBOUNCE_MS = 25;

struct Button {
  int pin = -1;        // -1: not used
  String action;       // on a press (or a short press when there's a hold action)
  String hold;         // on a long press; empty for none
  // Runtime
  bool down = false;
  bool rawDown = false;
  uint32_t changedAt = 0;
  uint32_t pressedAt = 0;
  bool holdFired = false;
};

struct Settings {
  String ssid, wifiPass;
  String host;              // Vessel's computer: IP address or name.local
  uint16_t port = 4040;     // Vessel ▸ Remote control shows the address and port
  String pin;               // Vessel's remote PIN
  String mode = "auto";     // auto | wifi | midi | both
  uint8_t midiChannel = 1;  // 1–16
  uint8_t midiBase = 60;    // button 1 = this note, button 2 = +1… ; holds = +8… ; screen tiles = +16…
  int ledPin = DEFAULT_LED_PIN;  // an RGB LED; -1 for none
  uint8_t brightness = 24;  // status light 0–255
  uint8_t backlight = 200;  // screen 0–255
  uint16_t dimSeconds = 60; // dim the screen after this long untouched; 0 never
  uint8_t orientation = 0;  // 0 portrait, 1 landscape, 2 landscape the other way up
  uint8_t sound = 1;        // tap sound: 0 off, 1 soft, 2 loud
  int vibratePin = -1;      // a vibration motor (through a transistor); -1 none
  bool pictures = true;     // show pictures of the slides
  bool partialFlush = false; // send only the changed rows (off: this panel puts them in the wrong place)
} cfg;

// MIDI notes: buttons from midiBase, their holds 8 higher, screen tiles 16 higher.
const int HOLD_NOTE_OFFSET = MAX_BUTTONS;
const int TILE_NOTE_OFFSET = 2 * MAX_BUTTONS;
const int MAX_TILES = 16;
const int MAX_MIDI_BASE = 127 - TILE_NOTE_OFFSET - MAX_TILES + 1;

Button buttons[MAX_BUTTONS];
int droppedButtons = 0;  // saved buttons on pins this board uses for its screen

void defaultButtons() {
#if BOARD_JC3248W535
  const int pins[] = {0};  // the BOOT button; the other pins near it run the screen
  const char *acts[] = {"next"};
#else
  const int pins[] = {0, 4, 5, 6};  // 0 is the BOOT button, so the board works with no wiring
  const char *acts[] = {"next", "prev", "black", "clear-all"};
#endif
  for (int i = 0; i < MAX_BUTTONS; i++) buttons[i] = Button();
  for (size_t i = 0; i < sizeof(pins) / sizeof(pins[0]); i++) {
    buttons[i].pin = pins[i];
    buttons[i].action = acts[i];
  }
}

void loadSettings() {
  prefs.begin("vessel", true);
  cfg.ssid = prefs.getString("ssid", "");
  cfg.wifiPass = prefs.getString("wpass", "");
  cfg.host = prefs.getString("host", "");
  cfg.port = prefs.getUShort("port", 4040);
  cfg.pin = prefs.getString("pin", "");
  cfg.mode = prefs.getString("mode", "auto");
  cfg.midiChannel = prefs.getUChar("mch", 1);
  cfg.midiBase = prefs.getUChar("mbase", 60);
  cfg.ledPin = prefs.getInt("led", DEFAULT_LED_PIN);
  cfg.brightness = prefs.getUChar("bright", 24);
  cfg.backlight = prefs.getUChar("blight", 200);
  cfg.dimSeconds = prefs.getUShort("dim", 60);
  cfg.orientation = prefs.getUChar("orient", 0) % 3;
  cfg.sound = prefs.getUChar("sound", 1) % 3;
  cfg.vibratePin = prefs.getInt("vibe", -1);
  cfg.pictures = prefs.getBool("pics", true);
  cfg.partialFlush = prefs.getBool("partial", false);
  bool haveButtons = prefs.getBool("btns", false);
  defaultButtons();
  if (haveButtons) {
    for (int i = 0; i < MAX_BUTTONS; i++) {
      String k = String(i);
      buttons[i].pin = prefs.getInt(("p" + k).c_str(), -1);
      buttons[i].action = prefs.getString(("a" + k).c_str(), "");
      buttons[i].hold = prefs.getString(("h" + k).c_str(), "");
    }
  }
  prefs.end();
  // Settings saved by another build may point at pins this board needs.
  if (cfg.ledPin >= 0 && pinReserved(cfg.ledPin)) cfg.ledPin = -1;
  if (cfg.vibratePin >= 0 && pinReserved(cfg.vibratePin)) cfg.vibratePin = -1;
  if (cfg.midiBase > MAX_MIDI_BASE) cfg.midiBase = 60;
  droppedButtons = 0;
  for (auto &b : buttons)
    if (b.pin >= 0 && pinReserved(b.pin)) {
      b.pin = -1;
      droppedButtons++;
    }
}

void saveSettings() {
  prefs.begin("vessel", false);
  prefs.putString("ssid", cfg.ssid);
  prefs.putString("wpass", cfg.wifiPass);
  prefs.putString("host", cfg.host);
  prefs.putUShort("port", cfg.port);
  prefs.putString("pin", cfg.pin);
  prefs.putString("mode", cfg.mode);
  prefs.putUChar("mch", cfg.midiChannel);
  prefs.putUChar("mbase", cfg.midiBase);
  prefs.putInt("led", cfg.ledPin);
  prefs.putUChar("bright", cfg.brightness);
  prefs.putUChar("blight", cfg.backlight);
  prefs.putUShort("dim", cfg.dimSeconds);
  prefs.putUChar("orient", cfg.orientation);
  prefs.putUChar("sound", cfg.sound);
  prefs.putInt("vibe", cfg.vibratePin);
  prefs.putBool("pics", cfg.pictures);
  prefs.putBool("partial", cfg.partialFlush);
  prefs.putBool("btns", true);
  for (int i = 0; i < MAX_BUTTONS; i++) {
    String k = String(i);
    prefs.putInt(("p" + k).c_str(), buttons[i].pin);
    prefs.putString(("a" + k).c_str(), buttons[i].action);
    prefs.putString(("h" + k).c_str(), buttons[i].hold);
  }
  prefs.end();
}

// ---- Status light -----------------------------------------------------------

uint32_t flashUntil = 0;
uint8_t flashR, flashG, flashB;

void ledRaw(uint8_t r, uint8_t g, uint8_t b) {
  if (cfg.ledPin < 0) return;
  uint16_t k = cfg.brightness;
  rgbLedWrite(cfg.ledPin, r * k / 255, g * k / 255, b * k / 255);
}

void flash(uint8_t r, uint8_t g, uint8_t b, uint32_t ms = 150) {
  flashR = r, flashG = g, flashB = b;
  flashUntil = millis() + ms;
  ledRaw(r, g, b);
}

// ---- Wi-Fi and Vessel -------------------------------------------------------

IPAddress vesselIp;  // resolved address when the host is a .local name
uint32_t lastResolve = 0;
bool vesselOk = false;     // the last request to Vessel worked
int vesselLastCode = 0;    // its HTTP status (negative: couldn't connect); 0 before any
uint32_t vesselLastAt = 0; // when it was made

bool wifiConfigured() { return cfg.ssid.length() > 0; }
bool wifiUp() { return WiFi.status() == WL_CONNECTED; }
bool vesselConfigured() { return cfg.host.length() > 0 && cfg.pin.length() > 0; }

void startWifi() {
  WiFi.disconnect(true);
  vesselOk = false;
  vesselLastCode = 0;
  liveReset();
  if (!wifiConfigured()) return;
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("vessel-remote");
  WiFi.setAutoReconnect(true);
  WiFi.begin(cfg.ssid.c_str(), cfg.wifiPass.c_str());
}

String vesselBase() {
  String host = cfg.host;
  if (host.endsWith(".local")) {
    if (!vesselIp || millis() - lastResolve > 60000) {
      static bool mdnsStarted = false;
      if (!mdnsStarted) mdnsStarted = MDNS.begin("vessel-remote");
      IPAddress ip = MDNS.queryHost(host.substring(0, host.length() - 6), 1500);
      lastResolve = millis();
      if (ip) vesselIp = ip;
    }
    if (vesselIp) host = vesselIp.toString();
  }
  return "http://" + host + ":" + String(cfg.port);
}

// Returns the HTTP status, or a negative HTTPClient error.
int vesselRequest(const String &path, String *body = nullptr, uint16_t timeoutMs = 1500) {
  HTTPClient http;
  http.setConnectTimeout(timeoutMs);
  http.setTimeout(timeoutMs);
  if (!http.begin(vesselBase() + path)) return -1;
  http.addHeader("X-Vessel-Pin", cfg.pin);
  int code = path == "/api/control" ? http.GET() : http.POST("");
  if (body && code > 0) *body = http.getString();
  http.end();
  vesselOk = code == 200 || code == 204;
  vesselLastCode = code;
  vesselLastAt = millis();
  return code;
}

// Forget the last answer, so the screen checks again with new settings.
void vesselSettingsChanged() {
  vesselOk = false;
  vesselLastCode = 0;
  vesselIp = IPAddress();
  liveReset();  // sign in again with the new settings
}

String describeResult(int code) {
  switch (code) {
    case 200:
    case 204: return "OK";
    case 401: return "Wrong PIN (see Vessel > Remote control)";
    case 404: return "Vessel doesn't know that action";
    case 429: return "Too many wrong PINs; Vessel is waiting a minute";
    default:
      return code < 0 ? "Can't reach Vessel at " + cfg.host + ":" + String(cfg.port) + " (" + HTTPClient::errorToString(code) + ")"
                      : "Vessel answered " + String(code);
  }
}

// ---- Sending an action --------------------------------------------------------

bool useWifi() {
  if (cfg.mode == "midi") return false;
  if (cfg.mode == "auto") return wifiUp() && vesselConfigured();
  return true;  // wifi | both
}
bool useMidi() {
  if (cfg.mode == "wifi") return false;
  if (cfg.mode == "auto") return !useWifi();
  return true;  // midi | both
}

void sendMidi(uint8_t note) {
  MIDI.noteOn(note, 127, cfg.midiChannel);
  delay(5);
  MIDI.noteOff(note, 0, cfg.midiChannel);
}

void screenResult(const String &action, bool ok, const String &message);  // display.ino

// Sends an action by Wi-Fi and/or MIDI (as the mode says). `who` names the
// button or tile in the console.
// ---- Sending in the background -----------------------------------------------
//
// Network requests take tens of milliseconds (seconds when Vessel can't be
// reached), so they run in their own task and the screen and buttons never
// wait. Requests go one at a time, in the order they were made.

// NetJob and NetResult are in ui.h.
QueueHandle_t netJobs, netResults;

int gotoSlide(int index);  // live.ino
int openServiceRow(int row);
int setMessage(const String &text);

void netTask(void *) {
  static NetJob job;  // static: too big for the task's stack twice over
  for (;;) {
    if (xQueueReceive(netJobs, &job, portMAX_DELAY) != pdTRUE) continue;
    NetResult r = {};
    r.kind = job.kind;
    strlcpy(r.action, job.action, sizeof r.action);
    strlcpy(r.who, job.who, sizeof r.who);
    strlcpy(r.label, job.label, sizeof r.label);
    uint32_t started = millis();
    switch (job.kind) {
      case JOB_ACTION: r.code = vesselRequest("/api/control/" + String(job.action)); break;
      case JOB_GOTO: r.code = gotoSlide(job.index); break;
      case JOB_OPEN_ROW: r.code = openServiceRow(job.index); break;
      case JOB_MESSAGE: r.code = setMessage(job.text); break;
    }
    r.ms = millis() - started;
    xQueueSend(netResults, &r, portMAX_DELAY);
  }
}

void startNetTask() {
  netJobs = xQueueCreate(8, sizeof(NetJob));
  netResults = xQueueCreate(8, sizeof(NetResult));
  xTaskCreatePinnedToCore(netTask, "vessel-net", 8192, nullptr, 1, nullptr, 0);
}

bool queueJob(NetJob &job) {
  if (xQueueSend(netJobs, &job, 0) == pdTRUE) return true;
  screenResult("", false, "Still sending; try again");
  return false;
}

bool queueCommand(uint8_t kind, int index, const String &text, const String &label) {
  if (!wifiUp() || !vesselConfigured()) {
    screenResult("", false, "Needs Wi-Fi and Vessel");
    return false;
  }
  static NetJob job;
  job = {};
  job.kind = kind;
  job.index = index;
  strlcpy(job.text, text.c_str(), sizeof job.text);
  strlcpy(job.label, label.c_str(), sizeof job.label);
  strlcpy(job.who, "Screen", sizeof job.who);
  return queueJob(job);
}

// Results come back here, on the main loop.
void pollNetResults() {
  NetResult r;
  while (xQueueReceive(netResults, &r, 0) == pdTRUE) {
    bool ok = r.code == 200 || r.code == 204;
    Console.printf("%s -> %s (Wi-Fi: %s, %lu ms)\n", r.who, r.kind == JOB_ACTION ? r.action : r.label, describeResult(r.code).c_str(), r.ms);
    if (ok) flash(255, 255, 255);
    else flash(255, 0, 0, 600);
    if (r.kind == JOB_ACTION) screenResult(r.action, ok, ok ? "Sent to Vessel" : describeResult(r.code));
    else screenResult("", ok, ok ? String(r.label) : "Couldn't send: " + describeResult(r.code));
  }
}

// Sends an action by Wi-Fi and/or MIDI (as the mode says). `who` names the
// button or tile in the console. MIDI goes at once; Wi-Fi in the background.
bool sendAction(const String &action, uint8_t note, const String &who) {
  bool midi = useMidi(), wifi = useWifi() && action.length();
  if (midi) sendMidi(note);
  if (wifi) {
    static NetJob job;
    job = {};
    job.kind = JOB_ACTION;
    strlcpy(job.action, action.c_str(), sizeof job.action);
    strlcpy(job.who, who.c_str(), sizeof job.who);
    if (!queueJob(job)) return false;
    if (midi) Console.printf("%s -> %s (MIDI note %d)\n", who.c_str(), action.c_str(), note);
    return true;  // the result is reported by pollNetResults
  }
  bool ok = midi;
  String problem;
  if (cfg.mode == "wifi" || cfg.mode == "both") {
    ok = false;
    problem = !wifiUp() ? "Wi-Fi isn't connected" : "Set Vessel's host and PIN first";
  }
  Console.printf("%s -> %s (%s)\n", who.c_str(), action.length() ? action.c_str() : "-", ok ? ("MIDI note " + String(note)).c_str() : problem.c_str());
  if (ok) flash(255, 255, 255);
  else flash(255, 0, 0, 600);
  screenResult(action, ok, ok ? "Sent by MIDI" : problem);
  return ok;
}

void fire(int index, bool isHold) {
  const String &action = isHold ? buttons[index].hold : buttons[index].action;
  sendAction(action, cfg.midiBase + index + (isHold ? HOLD_NOTE_OFFSET : 0), "Button " + String(index + 1) + (isHold ? " held" : " pressed"));
}

// ---- Buttons ------------------------------------------------------------------

void setupButtons() {
  for (auto &b : buttons) {
    b.down = b.rawDown = b.holdFired = false;
    if (b.pin >= 0) pinMode(b.pin, INPUT_PULLUP);  // wire each button between its pin and GND
  }
}

void pollButtons() {
  uint32_t now = millis();
  for (int i = 0; i < MAX_BUTTONS; i++) {
    Button &b = buttons[i];
    if (b.pin < 0) continue;
    bool raw = digitalRead(b.pin) == LOW;
    if (raw != b.rawDown) {
      b.rawDown = raw;
      b.changedAt = now;
    }
    if (now - b.changedAt < DEBOUNCE_MS || raw == b.down) {
      // Steady: check for a long press.
      if (b.down && b.hold.length() && !b.holdFired && now - b.pressedAt >= HOLD_MS) {
        b.holdFired = true;
        fire(i, true);
      }
      continue;
    }
    b.down = raw;
    if (raw) {
      b.pressedAt = now;
      b.holdFired = false;
      if (!b.hold.length()) fire(i, false);  // no hold action: act straight away
    } else if (b.hold.length() && !b.holdFired) {
      fire(i, false);  // a short press
    }
  }
}

// ---- Settings console ---------------------------------------------------------

String line;
enum { PROMPT_NONE, PROMPT_SSID, PROMPT_PASS, PROMPT_PIN } prompt = PROMPT_NONE;
String pendingSsid;

// Splits on spaces, keeping "quoted words" together.
int tokenize(const String &s, String *out, int max) {
  int n = 0;
  int i = 0;
  while (i < (int)s.length() && n < max) {
    while (i < (int)s.length() && s[i] == ' ') i++;
    if (i >= (int)s.length()) break;
    String t;
    if (s[i] == '"') {
      i++;
      while (i < (int)s.length() && s[i] != '"') t += s[i++];
      i++;
    } else {
      while (i < (int)s.length() && s[i] != ' ') t += s[i++];
    }
    out[n++] = t;
  }
  return n;
}

const char *wifiStatus() {
  if (!wifiConfigured()) return "not set up";
  switch (WiFi.status()) {
    case WL_CONNECTED: return "connected";
    case WL_NO_SSID_AVAIL: return "network not found";
    case WL_CONNECT_FAILED: return "couldn't connect (check the password)";
    case WL_CONNECTION_LOST: return "connection lost, retrying";
    default: return "connecting";
  }
}

void printHelp() {
  Console.println(F(
      "\nVessel Remote " FIRMWARE_VERSION " - type a command and press Enter.\n"
      "\n  Getting started\n"
      "    wifi                     Join a Wi-Fi network (asks for the name and password)\n"
      "    wifi \"Name\" password     Same, in one line (quote names with spaces)\n"
      "    scan                     List the Wi-Fi networks nearby\n"
      "    host 192.168.1.20        Vessel's computer (an IP address or name.local)\n"
      "    port 4040                Vessel's control port\n"
      "    pin                      Vessel's PIN (asks, and doesn't show it)\n"
      "    check                    Test the connection to Vessel\n"
      "\n  Buttons (wire each between its pin and GND)\n"
      "    buttons                  Show the buttons\n"
      "    button 2 pin 4           Put button 2 on GPIO 4\n"
      "    button 2 action prev     What a press does\n"
      "    button 2 hold logo       What a long press does ('button 2 hold none' to remove)\n"
      "    button 2 off             Stop using button 2\n"
      "    actions                  List the actions\n"
      "    test next                Send an action now\n"
      "\n  How it sends\n"
      "    mode auto                Wi-Fi when connected to Vessel, otherwise USB MIDI (default)\n"
      "    mode wifi | midi | both\n"
      "    midi channel 1           MIDI channel 1-16\n"
      "    midi base 60             Button 1's note (C4); the rest count up, holds start 8 higher,\n"
      "                             screen tiles 16 higher\n"
#if BOARD_JC3248W535
      "\n  Screen\n"
      "    live                     What Vessel is showing (the live feed)\n"
      "    backlight 200            Screen brightness 10-255\n"
      "    dim 60                   Dim the screen after 60 s untouched (0 never)\n"
      "    rotate portrait | landscape | flipped   Turn the screen\n"
      "    sound off | soft | loud | test          Tap sound (plug a speaker into SPK)\n"
      "    vibrate 17 | off         A vibration motor on a spare pin, through a transistor\n"
      "    pictures on | off        Pictures of the slides\n"
      "    partial on | off         Send only the changed rows to the screen (faster)\n"
      "    page home                Show a page: home, remote, service, wifi, settings, vessel, about\n"
      "    tap 160 300              Tap the screen at x,y (for testing)\n"
      "    swipe 250 200 50 200     Swipe from one point to another (for testing)\n"
      "    screenshot               Send the screen as an image (tools/screenshot.py)\n"
      "    touch log                Show where each touch lands (again to stop)\n"
      "    touch swap | touch flip x | touch flip y   If taps land in the wrong place\n"
      "    tiles                    List the screen tiles and their MIDI notes\n"
#endif
      "\n  Other\n"
      "    status                   Show all settings\n"
      "    led 48 | led off         The status light's pin\n"
      "    brightness 24            Status light 0-255\n"
      "    forget wifi              Forget the Wi-Fi network\n"
      "    factory reset            Erase all settings\n"
      "    reboot\n"));
}

void printButtons() {
  for (int i = 0; i < MAX_BUTTONS; i++) {
    Button &b = buttons[i];
    if (b.pin < 0) {
      Console.printf("  %d  off\n", i + 1);
      continue;
    }
    Console.printf("  %d  GPIO %-2d  press: %-12s hold: %-12s  MIDI notes %d / %d\n", i + 1, b.pin, b.action.length() ? b.action.c_str() : "-",
                  b.hold.length() ? b.hold.c_str() : "-", cfg.midiBase + i, cfg.midiBase + i + HOLD_NOTE_OFFSET);
  }
}

void printTiles();  // pages.ino

void printStatus() {
  Console.printf("\nVessel Remote %s\n", FIRMWARE_VERSION);
  Console.printf("  Wi-Fi      %s  %s\n", cfg.ssid.length() ? cfg.ssid.c_str() : "-", wifiStatus());
  if (wifiUp()) Console.printf("  Address    %s  (signal %d dBm)\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  Console.printf("  Vessel     %s:%u  PIN %s\n", cfg.host.length() ? cfg.host.c_str() : "-", cfg.port, cfg.pin.length() ? "set" : "not set");
  Console.printf("  Mode       %s  (sending by %s%s%s)\n", cfg.mode.c_str(), useWifi() ? "Wi-Fi" : "", useWifi() && useMidi() ? " and " : "", useMidi() ? "USB MIDI" : "");
  Console.printf("  MIDI       channel %d, notes from %d\n", cfg.midiChannel, cfg.midiBase);
  Console.printf("  Light      %s\n", cfg.ledPin < 0 ? "off" : ("GPIO " + String(cfg.ledPin)).c_str());
#if BOARD_JC3248W535
  Console.printf("  Screen     backlight %d, dims after %s\n", cfg.backlight, cfg.dimSeconds ? (String(cfg.dimSeconds) + " s").c_str() : "never");
  printLive();
  Console.println("  Screen tiles");
  printTiles();
#endif
  Console.println("  Buttons");
  printButtons();
}

bool parseIntArg(const String &s, int lo, int hi, int &out) {
  if (!s.length()) return false;
  for (char c : s)
    if (!isDigit(c) && c != '-') return false;
  out = s.toInt();
  return out >= lo && out <= hi;
}

void runCheck() {
  if (!wifiUp()) return (void)Console.printf("Wi-Fi is %s.\n", wifiStatus());
  if (!vesselConfigured()) return (void)Console.println("Set Vessel's host and pin first.");
  String body;
  int code = vesselRequest("/api/control", &body);
  Console.println(describeResult(code));
  if (code == 200) flash(0, 255, 0, 600);
  else flash(255, 0, 0, 600);
}

void handleCommand(String input) {
  input.trim();
  if (!input.length()) return;
  String t[6];
  int n = tokenize(input, t, 6);
  String cmd = t[0];
  cmd.toLowerCase();

  if (cmd == "help" || cmd == "?") return printHelp();
  if (cmd == "status" || cmd == "show") return printStatus();
  if (cmd == "buttons") return printButtons();
  if (cmd == "reboot") {
    Console.println("Restarting...");
    delay(200);
    ESP.restart();
  }
  if (cmd == "actions") {
    for (int i = 0; i < ACTION_COUNT; i++) Console.printf("  %s\n", ACTIONS[i]);
    return;
  }
  if (cmd == "scan") {
    Console.println("Looking for networks...");
    int found = WiFi.scanNetworks();
    if (found <= 0) Console.println("None found.");
    for (int i = 0; i < found; i++)
      Console.printf("  %-32s %4d dBm %s\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "(open)" : "");
    WiFi.scanDelete();
    return;
  }
  if (cmd == "wifi") {
    if (n == 1) {
      prompt = PROMPT_SSID;
      Console.print("Wi-Fi network name: ");
      return;
    }
    cfg.ssid = t[1];
    cfg.wifiPass = n > 2 ? t[2] : "";
    saveSettings();
    Console.printf("Joining \"%s\"... type 'status' to see how it goes.\n", cfg.ssid.c_str());
    return startWifi();
  }
  if (cmd == "forget" && n > 1 && t[1] == "wifi") {
    cfg.ssid = cfg.wifiPass = "";
    saveSettings();
    startWifi();
    return (void)Console.println("Forgot the Wi-Fi network.");
  }
  if (cmd == "host") {
    if (n < 2) return (void)Console.println("Type: host <Vessel computer's IP address or name.local>");
    String h = t[1];
    h.replace("http://", "");
    int colon = h.indexOf(':');
    if (colon > 0) {
      cfg.port = h.substring(colon + 1).toInt();
      h = h.substring(0, colon);
    }
    while (h.endsWith("/")) h.remove(h.length() - 1);
    cfg.host = h;
    vesselSettingsChanged();
    saveSettings();
    return (void)Console.printf("Vessel is at %s:%u\n", cfg.host.c_str(), cfg.port);
  }
  if (cmd == "port") {
    int p;
    if (n < 2 || !parseIntArg(t[1], 1, 65535, p)) return (void)Console.println("Type: port 4040");
    cfg.port = p;
    vesselSettingsChanged();
    saveSettings();
    return (void)Console.printf("Port %u\n", cfg.port);
  }
  if (cmd == "pin") {
    if (n == 1) {
      prompt = PROMPT_PIN;
      Console.print("Vessel's PIN (it won't be shown): ");
      return;
    }
    cfg.pin = t[1];
    vesselSettingsChanged();
    saveSettings();
    return (void)Console.println("PIN saved.");
  }
  if (cmd == "check") return runCheck();
  if (cmd == "test") {
    if (n < 2 || !isAction(t[1])) return (void)Console.println("Type: test <action>  (see 'actions')");
    if (!wifiUp() || !vesselConfigured()) return (void)Console.println("Testing needs Wi-Fi and Vessel's host and pin.");
    return (void)Console.println(describeResult(vesselRequest("/api/control/" + t[1])));
  }
  if (cmd == "mode") {
    String m = n > 1 ? t[1] : "";
    m.toLowerCase();
    if (m != "auto" && m != "wifi" && m != "midi" && m != "both") return (void)Console.println("Type: mode auto | wifi | midi | both");
    cfg.mode = m;
    saveSettings();
    return (void)Console.printf("Mode %s\n", m.c_str());
  }
  if (cmd == "midi") {
    int v;
    if (n == 3 && t[1] == "channel" && parseIntArg(t[2], 1, 16, v)) cfg.midiChannel = v;
    else if (n == 3 && t[1] == "base" && parseIntArg(t[2], 0, MAX_MIDI_BASE, v)) cfg.midiBase = v;
    else return (void)Console.printf("Type: midi channel 1-16, or midi base 0-%d\n", MAX_MIDI_BASE);
    saveSettings();
    return (void)Console.printf("MIDI channel %d, notes from %d\n", cfg.midiChannel, cfg.midiBase);
  }
  if (cmd == "led") {
    int p;
    if (n == 2 && t[1] == "off") {
      ledRaw(0, 0, 0);
      cfg.ledPin = -1;
    } else if (n == 2 && parseIntArg(t[1], 0, 48, p)) {
      if (pinReserved(p)) return (void)Console.printf("GPIO %d is used by this board (screen, touch or USB); choose another pin.\n", p);
      cfg.ledPin = p;
    } else return (void)Console.println("Type: led <GPIO> or led off");
    saveSettings();
    return (void)Console.println("Light updated.");
  }
  if (cmd == "brightness") {
    int v;
    if (n < 2 || !parseIntArg(t[1], 0, 255, v)) return (void)Console.println("Type: brightness 0-255");
    cfg.brightness = v;
    saveSettings();
    return;
  }
  if (cmd == "button") {
    int i;
    if (n < 3 || !parseIntArg(t[1], 1, MAX_BUTTONS, i)) return (void)Console.printf("Type: button 1-%d pin|action|hold|off ...\n", MAX_BUTTONS);
    Button &b = buttons[i - 1];
    String what = t[2];
    int p;
    if (what == "off") {
      b.pin = -1;
    } else if (what == "pin" && n > 3 && parseIntArg(t[3], 0, 48, p)) {
      if (pinReserved(p)) return (void)Console.printf("GPIO %d is used by this board (screen, touch or USB); choose another pin.\n", p);
      for (int j = 0; j < MAX_BUTTONS; j++)
        if (j != i - 1 && buttons[j].pin == p) return (void)Console.printf("Button %d already uses GPIO %d.\n", j + 1, p);
      b.pin = p;
    } else if (what == "action" && n > 3 && isAction(t[3])) {
      b.action = t[3];
    } else if (what == "hold" && n > 3 && (t[3] == "none" || isAction(t[3]))) {
      b.hold = t[3] == "none" ? "" : t[3];
    } else {
      return (void)Console.println("Type e.g. 'button 2 pin 4', 'button 2 action prev', 'button 2 hold logo'. See 'actions'.");
    }
    saveSettings();
    setupButtons();
    return printButtons();
  }
#if BOARD_JC3248W535
  if (cmd == "live") return printLive();
  if (cmd == "dim") {
    int v;
    if (n < 2 || !parseIntArg(t[1], 0, 3600, v)) return (void)Console.println("Type: dim <seconds>  (0 never)");
    cfg.dimSeconds = v;
    saveSettings();
    return (void)Console.printf("Dims after %d s\n", v);
  }
#endif
  if (screenConsole(t, n)) return;  // display.ino: screenshot, tap, swipe, page, rotate, backlight, touch, tiles
  if (audioConsole(t, n)) return;   // audio.ino: sound, vibrate
#if BOARD_JC3248W535
  if (cmd == "pictures") {
    String a = n > 1 ? t[1] : "";
    if (a != "on" && a != "off") return (void)Console.println("Type: pictures on | off");
    cfg.pictures = a == "on";
    saveSettings();
    return (void)Console.printf("Slide pictures %s\n", a.c_str());
  }
#endif
  if (cmd == "factory" && n > 1 && t[1] == "reset") {
    prefs.begin("vessel", false);
    prefs.clear();
    prefs.end();
    Console.println("Settings erased. Restarting...");
    delay(200);
    ESP.restart();
  }
  Console.printf("Unknown command '%s'. Type 'help'.\n", cmd.c_str());
}

void handlePromptLine(const String &value) {
  switch (prompt) {
    case PROMPT_SSID:
      if (!value.length()) {
        prompt = PROMPT_NONE;
        Console.println("\nCancelled.");
        return;
      }
      pendingSsid = value;
      prompt = PROMPT_PASS;
      Console.println();
      Console.print("Password (leave empty for an open network; it won't be shown): ");
      return;
    case PROMPT_PASS:
      prompt = PROMPT_NONE;
      Console.println();
      cfg.ssid = pendingSsid;
      cfg.wifiPass = value;
      vesselSettingsChanged();
      saveSettings();
      Console.printf("Joining \"%s\"... type 'status' to see how it goes.\n", cfg.ssid.c_str());
      startWifi();
      return;
    case PROMPT_PIN:
      prompt = PROMPT_NONE;
      Console.println();
      cfg.pin = value;
      cfg.pin.trim();
      vesselSettingsChanged();
      saveSettings();
      Console.println("PIN saved.");
      return;
    default: return;
  }
}

void pollConsole() {
  static bool lastWasCR = false;
  while (Console.available()) {
    char c = Console.read();
    if (c == '\n' && lastWasCR) {  // the \n of a \r\n
      lastWasCR = false;
      continue;
    }
    lastWasCR = c == '\r';
    if (c == '\r' || c == '\n') {
      String got = line;
      line = "";
      if (prompt != PROMPT_NONE) {
        handlePromptLine(got);
        if (prompt == PROMPT_NONE) Console.print("> ");
      } else {
        Console.println();
        handleCommand(got);
        if (prompt == PROMPT_NONE) Console.print("> ");
      }
    } else if (c == 8 || c == 127) {
      if (line.length()) {
        line.remove(line.length() - 1);
        if (prompt != PROMPT_PASS && prompt != PROMPT_PIN) Console.print("\b \b");
      }
    } else if (line.length() < 200) {
      line += c;
      // Echo for terminals that don't, but never echo secrets.
      if (prompt != PROMPT_PASS && prompt != PROMPT_PIN) Console.print(c);
    }
  }
}

// ---- Status light colours -------------------------------------------------------

void updateLed() {
  if (millis() < flashUntil) return;
  if (useWifi() && vesselOk) return ledRaw(0, 255, 0);          // green: Wi-Fi and Vessel answering
  if (useWifi()) return ledRaw(0, 120, 255);                    // blue: on Wi-Fi, Vessel not tried yet
  if (wifiConfigured() && !wifiUp()) {                          // amber blink: joining Wi-Fi
    bool on = (millis() / 400) % 2;
    return on ? ledRaw(255, 120, 0) : ledRaw(0, 0, 0);
  }
  ledRaw(150, 0, 255);                                          // purple: USB MIDI
}

// ---- Arduino ------------------------------------------------------------------

void setup() {
  loadSettings();
  // Name the device before USB starts, so the Mac lists it as "Vessel Remote".
  USB.productName("Vessel Remote");
  USB.manufacturerName("Vessel");
  MIDI.begin();
  Console.begin(115200);
  USB.begin();
  setupButtons();
  startNetTask();
  audioBegin();
  screenBegin();
  picturesBegin();
  startWifi();
  ledRaw(0, 0, 0);
  // Give the serial monitor a moment to attach, keeping the screen alive.
  for (uint32_t t = millis(); millis() - t < 1500;) {
    screenLoop();
    delay(5);
  }
  Console.printf("\nVessel Remote %s. Type 'help' for settings.\n", FIRMWARE_VERSION);
  if (droppedButtons) Console.printf("%d saved button(s) were on pins this board uses for its screen, so they're off. Type 'buttons'.\n", droppedButtons);
  Console.print("> ");
}

void loop() {
  pollConsole();
  pollButtons();
  updateLed();
  pollNetResults();
  liveLoop();
  screenLoop();
  static wl_status_t lastWifi = WL_IDLE_STATUS;
  wl_status_t w = WiFi.status();
  if (w != lastWifi && wifiConfigured()) {
    if (w == WL_CONNECTED) Console.printf("\nWi-Fi connected: %s\n> ", WiFi.localIP().toString().c_str());
    else if (lastWifi == WL_CONNECTED) Console.print("\nWi-Fi disconnected, retrying...\n> ");
    else if (w == WL_CONNECT_FAILED || w == WL_NO_SSID_AVAIL) Console.printf("\nWi-Fi: %s\n> ", wifiStatus());
    lastWifi = w;
  }
  delay(2);
}
