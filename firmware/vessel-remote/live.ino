// What Vessel is showing, live: signs in to Vessel's remote control with the
// PIN (as the phone remote does) and follows its event stream. Also sends the
// commands that need a session: go to a slide, open a service item, set the
// message.
//
// Only the touch-screen build uses this.

#if BOARD_JC3248W535

#include <ArduinoJson.h>

LiveState live;

String sessionCookie;     // "vessel_session=<hex>"; shared with the network task
SemaphoreHandle_t sessionLock = xSemaphoreCreateMutex();

String getCookie() {
  xSemaphoreTake(sessionLock, portMAX_DELAY);
  String c = sessionCookie;
  xSemaphoreGive(sessionLock);
  return c;
}

void setCookie(const String &c) {
  xSemaphoreTake(sessionLock, portMAX_DELAY);
  sessionCookie = c;
  xSemaphoreGive(sessionLock);
}
bool liveStopped = false;  // wrong PIN: wait for new settings

// Big documents go in PSRAM.
struct PsramAllocator : ArduinoJson::Allocator {
  void *allocate(size_t n) override { return heap_caps_malloc(n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT); }
  void deallocate(void *p) override { heap_caps_free(p); }
  void *reallocate(void *p, size_t n) override { return heap_caps_realloc(p, n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT); }
} psramAllocator;

// ---- Text for the screen --------------------------------------------------------------

// The screen's fonts are Latin-1; turn UTF-8 into that, swapping the usual
// typographic characters for plain ones.
String latin1(const char *s) {
  String out;
  if (!s) return out;
  size_t len = strlen(s);
  out.reserve(len);
  for (size_t i = 0; i < len;) {
    uint8_t c = s[i];
    uint32_t cp;
    int n;
    if (c < 0x80) cp = c, n = 1;
    else if ((c & 0xE0) == 0xC0) cp = c & 0x1F, n = 2;
    else if ((c & 0xF0) == 0xE0) cp = c & 0x0F, n = 3;
    else if ((c & 0xF8) == 0xF0) cp = c & 0x07, n = 4;
    else {
      i++;
      continue;
    }
    if (i + n > len) break;
    for (int k = 1; k < n; k++) cp = (cp << 6) | (s[i + k] & 0x3F);
    i += n;
    if (cp == '\t' || cp == 0xA0) cp = ' ';
    if (cp == '\r' || (cp < 0x20 && cp != '\n')) continue;
    if (cp < 0x100) {
      out += (char)cp;
      continue;
    }
    switch (cp) {
      case 0x2018: case 0x2019: case 0x201A: case 0x2032: out += '\''; break;
      case 0x201C: case 0x201D: case 0x201E: case 0x2033: out += '"'; break;
      case 0x2010: case 0x2011: case 0x2012: case 0x2013: case 0x2014: case 0x2212: out += '-'; break;
      case 0x2026: out += "..."; break;
      case 0x2022: case 0x2027: out += (char)0xB7; break;
      case 0x266D: out += 'b'; break;
      case 0x266F: out += '#'; break;
      case 0x2028: case 0x2029: out += '\n'; break;
      default: out += '?';
    }
  }
  return out;
}

int32_t parseColour(const char *hex) {
  if (!hex || hex[0] != '#' || strlen(hex) < 7) return -1;
  uint32_t v = strtoul(hex + 1, nullptr, 16);
  if (strlen(hex) == 4) {  // #rgb
    uint32_t r = (v >> 8) & 0xF, g = (v >> 4) & 0xF, b = v & 0xF;
    v = (r * 17) << 16 | (g * 17) << 8 | (b * 17);
  } else {
    v = strtoul(String(hex + 1).substring(0, 6).c_str(), nullptr, 16);
  }
  return ((v >> 8) & 0xF800) | ((v >> 5) & 0x07E0) | ((v >> 3) & 0x001F);
}

// ---- The timer ----------------------------------------------------------------------------

int64_t vesselNow() { return (int64_t)millis() + live.clockOffset; }

bool timerRunning() { return live.timerMode == "clock" || live.timerStartedAt >= 0; }

// As Vessel's src/shared/timer.ts: remaining for a countdown, elapsed for a count-up.
int64_t timerValueMs() {
  int64_t now = vesselNow();
  if (live.timerMode == "clock") return live.timerTargetAt - now;
  int64_t elapsed = live.timerElapsedMs + (live.timerStartedAt >= 0 ? max<int64_t>(0, now - live.timerStartedAt) : 0);
  return live.timerMode == "countup" ? elapsed : live.timerDurationMs - elapsed;
}

String timerText() {
  int64_t ms = timerValueMs();
  bool negative = ms < 0;
  int64_t abs = negative ? -ms : ms;
  bool roundUp = live.timerMode != "countup";
  int64_t total = negative ? abs / 1000 : roundUp ? (abs + 999) / 1000 : abs / 1000;
  int h = total / 3600, m = (total % 3600) / 60, s = total % 60;
  char buf[16];
  if (h > 0) snprintf(buf, sizeof buf, "%s%d:%02d:%02d", negative && total ? "-" : "", h, m, s);
  else snprintf(buf, sizeof buf, "%s%d:%02d", negative && total ? "-" : "", m, s);
  return buf;
}

// ---- Reading Vessel's state --------------------------------------------------------------

void applyState(const String &json) {
  JsonDocument doc(&psramAllocator);
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Console.printf("\nLive: couldn't read Vessel's state (%s)\n> ", err.c_str());
    return;
  }
  JsonObjectConst p = doc["presentation"];
  live.havePresentation = !p.isNull();
  live.slides.clear();
  live.liveIndex = -1;
  live.presentationName = "";
  if (live.havePresentation) {
    live.presentationName = latin1(p["name"] | "");
    for (JsonObjectConst s : p["slides"].as<JsonArrayConst>()) {
      LiveSlide slide;
      slide.text = latin1(s["text"] | "");
      slide.group = latin1(s["group"] | "");
      slide.colour = parseColour(s["color"] | "");
      live.slides.push_back(slide);
    }
    live.liveIndex = p["liveIndex"].isNull() ? -1 : (int)p["liveIndex"];
  }

  JsonObjectConst svc = doc["service"];
  live.haveService = !svc.isNull();
  live.service.clear();
  live.serviceName = live.haveService ? latin1(svc["name"] | "") : "";
  for (JsonObjectConst it : svc["items"].as<JsonArrayConst>()) {
    ServiceItem item;
    item.name = latin1(it["name"] | "");
    item.header = strcmp(it["kind"] | "", "header") == 0;
    item.current = it["current"] | false;
    item.live = it["live"] | false;
    live.service.push_back(item);
  }

  live.liveText = latin1(doc["live"]["text"] | "");
  live.cleared = doc["live"]["cleared"] | false;
  live.blackout = doc["live"]["blackout"] | false;

  JsonObjectConst next = doc["next"];
  live.hasNext = !next.isNull();
  live.nextText = live.hasNext ? latin1(next["text"] | "") : "";
  live.nextGroup = live.hasNext ? latin1(next["group"] | "") : "";

  JsonObjectConst t = doc["timer"];
  live.timerMode = String(t["mode"] | "countdown");
  live.timerDurationMs = t["durationMs"] | (int64_t)0;
  live.timerElapsedMs = t["elapsedMs"] | (int64_t)0;
  live.timerStartedAt = t["startedAt"].isNull() ? -1 : (int64_t)(t["startedAt"] | (int64_t)0);
  live.timerTargetAt = t["targetAt"] | (int64_t)0;

  live.message = latin1(doc["message"] | "");
  if (!doc["serverTime"].isNull()) live.clockOffset = (doc["serverTime"] | (int64_t)0) - (int64_t)millis();

  live.connected = true;
  live.problem = "";
  live.version++;
}

// ---- Signing in ----------------------------------------------------------------------------

String hostHeader() { return cfg.host + ":" + String(cfg.port); }

// Returns the HTTP status (negative: couldn't connect).
int liveLogin() {
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(2000);
  if (!http.begin(vesselBase() + "/api/login")) return -1;
  const char *keep[] = {"Set-Cookie"};
  http.collectHeaders(keep, 1);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Vessel", "1");
  JsonDocument body;
  body["pin"] = cfg.pin;
  String payload;
  serializeJson(body, payload);
  int code = http.POST(payload);
  if (code == 200) {
    String cookie = http.header("Set-Cookie");
    int semi = cookie.indexOf(';');
    setCookie(semi > 0 ? cookie.substring(0, semi) : cookie);
  }
  http.end();
  if (code == 401 || code == 429) {
    // Same as a wrong PIN on the control API: the screen shows it.
    vesselOk = false;
    vesselLastCode = code;
    vesselLastAt = millis();
  }
  return code;
}

// ---- Event streams ------------------------------------------------------------------------
//
// Two streams: the operator's state (what's live, the service, the timer) and,
// when slide pictures are on, the presenter view's, which says where Vessel
// keeps pictures of the slides. Vessel only draws those pictures while a
// presenter view is watching.

// EventStream is in ui.h.
EventStream opStream = {"/api/events", "Live"};
EventStream presStream = {"/api/events?view=presenter", "Pictures"};

void closeStream(EventStream &s) {
  if (s.client.connected()) s.client.stop();
  s.open = false;
  s.line = s.event = s.data = "";
}

void liveClose(const String &why) {
  closeStream(opStream);
  closeStream(presStream);
  bool changed = live.connected || live.problem != why;
  live.connected = false;
  live.problem = why;
  if (changed) live.version++;
}

// Forget the session: new Wi-Fi, address or PIN.
void liveReset() {
  liveClose("");
  setCookie("");
  liveStopped = false;
  opStream.retryAt = presStream.retryAt = 0;
  opStream.backoff = presStream.backoff = 2000;
}

void retryLater(EventStream &s) {
  closeStream(s);
  s.retryAt = millis() + s.backoff;
  s.backoff = min<uint32_t>(s.backoff * 2, 30000);
}

void liveRetryLater(const String &why) {
  retryLater(opStream);
  closeStream(presStream);
  bool changed = live.connected || live.problem != why;
  live.connected = false;
  live.problem = why;
  if (changed) live.version++;
}

// Opens a stream. Returns the HTTP status (negative: couldn't connect).
int openStream(EventStream &s) {
  String host = vesselBase();  // resolves name.local
  host = host.substring(7, host.lastIndexOf(':'));
  if (!s.client.connect(host.c_str(), cfg.port, 1500)) return -1;
  // HTTP/1.0 so Vessel streams without chunked encoding.
  s.client.print(String("GET ") + s.path + " HTTP/1.0\r\nHost: " + hostHeader() + "\r\nAccept: text/event-stream\r\nCookie: " + getCookie() + "\r\n\r\n");
  // Status line and headers.
  uint32_t until = millis() + 2500;
  String status, header;
  bool headersDone = false;
  while (millis() < until && s.client.connected() && !headersDone) {
    while (s.client.available()) {
      char c = s.client.read();
      if (c == '\r') continue;
      if (c != '\n') {
        header += c;
        continue;
      }
      if (!status.length()) status = header;
      else if (!header.length()) {
        headersDone = true;
        break;
      }
      header = "";
    }
    delay(2);
  }
  int code = status.length() > 9 ? status.substring(9, 12).toInt() : 0;
  if (code == 200 && headersDone) {
    s.open = true;
    s.backoff = 2000;
    Console.printf("\n%s: following Vessel\n> ", s.name);
  }
  return code == 200 && !headersDone ? 0 : code;
}

void liveConnect() {
  if (!getCookie().length()) {
    int code = liveLogin();
    if (code == 401) {
      liveStopped = true;
      return liveClose("Wrong PIN");
    }
    if (code == 429) return liveRetryLater("Too many wrong PINs; waiting");
    if (code != 200) return liveRetryLater(code < 0 ? "Can't reach Vessel" : "Vessel answered " + String(code));
  }
  int code = openStream(opStream);
  if (code == 401) {  // the session ended (Vessel restarted or the PIN changed)
    setCookie("");
    return liveRetryLater("Signing in again");
  }
  if (code < 0) return liveRetryLater("Can't reach Vessel");
  if (code != 200) return liveRetryLater("Vessel didn't send its state");
}

// The presenter view's state: only where the slide pictures are.
void applyPresenter(const String &json) {
  JsonDocument filter;
  filter["pictures"] = true;
  filter["presentation"]["name"] = true;
  JsonDocument doc(&psramAllocator);
  if (deserializeJson(doc, json, DeserializationOption::Filter(filter))) return;
  picturesSetSource(String(doc["pictures"]["key"] | ""), doc["pictures"]["count"] | 0, latin1(doc["presentation"]["name"] | ""));
}

void handleEvent(EventStream &s) {
  if (s.event == "state" && s.data.length()) applyState(s.data);
  else if (s.event == "presenter" && s.data.length()) applyPresenter(s.data);
  s.event = s.data = "";
}

void handleLine(EventStream &s) {
  const String &line = s.line;
  if (!line.length()) return handleEvent(s);
  if (line.startsWith("event:")) {
    s.event = line.substring(6);
    s.event.trim();
  } else if (line.startsWith("data:")) {
    if (s.data.length()) s.data += '\n';
    s.data += line.substring(line.charAt(5) == ' ' ? 6 : 5);
  }
}

// Reads what has arrived, a chunk at a time so the screen isn't held up.
// False when the stream has closed.
bool readStream(EventStream &s) {
  if (!s.client.connected() && !s.client.available()) return false;
  static uint8_t buf[2048];
  for (int rounds = 0; rounds < 8 && s.client.available(); rounds++) {
    int n = s.client.read(buf, sizeof buf);
    for (int i = 0; i < n; i++) {
      char c = buf[i];
      if (c == '\r') continue;
      if (c == '\n') {
        handleLine(s);
        s.line = "";
      } else if (s.line.length() < 512 * 1024) {
        s.line += c;
      }
    }
  }
  return true;
}

void liveLoop() {
  bool wanted = cfg.mode != "midi" && wifiUp() && vesselConfigured();
  if (!wanted) {
    if (opStream.open || live.connected) liveClose("");
    return;
  }
  if (liveStopped) return;
  if (!opStream.open) {
    // Wait for the control API to confirm the PIN, so a wrong one isn't tried twice.
    if (vesselLastCode == 401) return liveClose("Wrong PIN");
    if (millis() < opStream.retryAt) return;
    return liveConnect();
  }
  if (!readStream(opStream)) return liveRetryLater("Vessel closed the connection");

  // Slide pictures: the presenter view, once the operator's stream works.
  if (!cfg.pictures || !live.connected) {
    if (presStream.open) closeStream(presStream);
    return;
  }
  if (!presStream.open) {
    if (millis() < presStream.retryAt) return;
    if (openStream(presStream) != 200) retryLater(presStream);
    return;
  }
  if (!readStream(presStream)) retryLater(presStream);
}

// ---- Commands that need a session -------------------------------------------------------------

// Sends a command such as {"type":"goto","index":3}. Returns the HTTP status.
int vesselCommand(JsonDocument &command) {
  if (!wifiUp() || !vesselConfigured()) return -1;
  String payload;
  serializeJson(command, payload);
  for (int attempt = 0; attempt < 2; attempt++) {
    if (!getCookie().length()) {
      int code = liveLogin();
      if (code != 200) return code;
    }
    HTTPClient http;
    http.setConnectTimeout(1500);
    http.setTimeout(1500);
    if (!http.begin(vesselBase() + "/api/command")) return -1;
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Vessel", "1");
    http.addHeader("Cookie", getCookie());
    int code = http.POST(payload);
    http.end();
    if (code == 401) {
      setCookie("");
      continue;
    }
    return code;
  }
  return 401;
}

int gotoSlide(int index) {
  JsonDocument c;
  c["type"] = "goto";
  c["index"] = index;
  return vesselCommand(c);
}

int openServiceRow(int row) {
  JsonDocument c;
  c["type"] = "openRow";
  c["row"] = row;
  return vesselCommand(c);
}

int setMessage(const String &text) {
  JsonDocument c;
  c["type"] = "message";
  c["text"] = text;
  return vesselCommand(c);
}

void printLive() {
  Console.printf("  Live       %s\n", live.connected ? "following Vessel" : live.problem.length() ? live.problem.c_str() : "not connected");
  Console.printf("  Pictures   %s\n", !cfg.pictures ? "off" : presStream.open ? picturesSummary().c_str() : "not connected");
  if (!live.connected) return;
  Console.printf("  Showing    %s, slide %d of %d%s%s\n", live.havePresentation ? live.presentationName.c_str() : "-", live.liveIndex + 1,
                 (int)live.slides.size(), live.blackout ? ", black" : "", live.cleared ? ", cleared" : "");
  Console.printf("  Service    %s (%d items)\n", live.haveService ? live.serviceName.c_str() : "-", (int)live.service.size());
  Console.printf("  Timer      %s %s\n", timerText().c_str(), timerRunning() ? "(running)" : "");
}

#else  // no screen: nothing to show it on

int gotoSlide(int) { return -1; }
int openServiceRow(int) { return -1; }
int setMessage(const String &) { return -1; }
void liveLoop() {}
void liveReset() {}
void printLive() {}

#endif
