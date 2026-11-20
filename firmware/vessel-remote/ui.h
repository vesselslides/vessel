// Shared between the sketch's files: what Vessel is showing (live.ino) and
// the screen's pages (display.ino, pages.ino).
#pragma once
#include <Arduino.h>
#include <vector>
#include <WiFi.h>

// ---- What Vessel is showing, from its remote-control event stream ---------------

struct LiveSlide {
  String text;  // Latin-1, ready for the screen's fonts
  String group;
  int32_t colour = -1;  // RGB565, or -1 for none
};

struct ServiceItem {
  String name;
  bool header = false;
  bool current = false;  // open in Vessel
  bool live = false;     // on screen
};

struct LiveState {
  bool connected = false;  // signed in and receiving
  String problem;          // why not, for the screen

  bool havePresentation = false;
  String presentationName;
  std::vector<LiveSlide> slides;
  int liveIndex = -1;

  String liveText;
  bool cleared = false;
  bool blackout = false;

  bool hasNext = false;
  String nextText, nextGroup;

  bool haveService = false;
  String serviceName;
  std::vector<ServiceItem> service;

  String timerMode = "countdown";  // countdown | countup | clock
  int64_t timerDurationMs = 0, timerElapsedMs = 0, timerStartedAt = -1, timerTargetAt = 0;
  int64_t clockOffset = 0;  // Vessel's clock minus millis()

  String message;
  uint32_t version = 0;  // goes up with every change
};

extern LiveState live;

// ---- Screen pages ---------------------------------------------------------------

enum Page : uint8_t {
  PAGE_HOME,
  PAGE_REMOTE,
  PAGE_SERVICE,
  PAGE_WIFI,
  PAGE_SETTINGS,
  PAGE_VESSEL,  // Settings > Vessel
  PAGE_ABOUT,   // Settings > About
  PAGE_KEYBOARD,
  PAGE_COUNT
};

// What a keyboard entry is for.
enum KeyboardFor : uint8_t { KB_WIFI_PASSWORD, KB_WIFI_NAME, KB_HOST, KB_PORT, KB_PIN, KB_MESSAGE };

// A tappable area, collected while a page draws.
struct Hit {
  int16_t x, y, w, h;
  uint16_t id;
  uint8_t flags;
};
enum : uint8_t { HIT_FAST = 1 };  // act on touch-down (buttons that must feel instant)

// A picture of a slide (RGB565), from pictures.ino.
struct Picture {
  uint16_t *px = nullptr;
  int w = 0, h = 0;
};

// A Wi-Fi network found by a scan.
struct WifiNetwork {
  String ssid;
  int rssi;
  bool secure;
};

// A Vessel found on the network.
struct FoundVessel {
  String host;
  uint16_t port;
};

// ---- Network requests, sent from a background task (vessel-remote.ino) ----------

enum : uint8_t { JOB_ACTION, JOB_GOTO, JOB_OPEN_ROW, JOB_MESSAGE };

struct NetJob {
  uint8_t kind;
  int index;
  char action[24];
  char who[40];
  char label[64];   // what to say when it works
  char text[204];   // a message
};

struct NetResult {
  uint8_t kind;
  int code;
  uint32_t ms;
  char action[24];
  char who[40];
  char label[64];
};


// ---- Text measuring cache (display.ino) -------------------------------------------

struct FontMetrics {
  const uint8_t *font = nullptr;
  int16_t bar = 0;  // width of "||"
  int16_t capH = 0;
  int8_t adv[224];
  bool have[224];
};

// ---- A server-sent event stream from Vessel (live.ino) ------------------------------

struct EventStream {
  const char *path;
  const char *name;  // for the console
  WiFiClient client;
  bool open = false;
  uint32_t retryAt = 0, backoff = 2000;
  String line, event, data;
};

