// The screen's pages. Each page has a draw function, which also lists what can
// be tapped (addHit), and a tap handler. display.ino calls:
//   drawPage, pageTap, pageOpened, pagesLoop, pageLiveChanged, pageShowsClock

#if BOARD_JC3248W535

#include <lwip/sockets.h>

// Tap ids (1-6 are the back button and tabs, in display.ino).
enum : uint16_t {
  H_ACT = 100,  // + action tile index
  H_HOME_WIFI = 200, H_HOME_VESSEL, H_HOME_SERVICE,
  H_SEG = 220,  // + 0 slides, 1 service
  H_WIFI_SCAN = 300, H_WIFI_FORGET, H_WIFI_OTHER,
  H_SET_VESSEL = 320, H_SET_ABOUT, H_SET_RESTART, H_SET_DIMMER, H_SET_BRIGHTER,
  H_SET_MODE = 340,  // + 0..3
  H_SET_DIM = 350,   // + 0..3
  H_SET_ORIENT = 360,  // + 0..2
  H_SET_SOUND = 370,   // + 0..2
  H_SET_PICS = 380,    // + 0..1
  H_V_HOST = 400, H_V_PORT, H_V_PIN, H_V_FIND, H_V_CHECK,
  H_MSG = 420,
  H_KB_CANCEL = 500, H_KB_DONE, H_KB_SHOW, H_KB_SHIFT, H_KB_MODE, H_KB_BACK, H_KB_SPACE,
  H_KEY = 600,    // + character code
  H_ROW = 1000,   // + list row
  H_FOUND = 900,  // + found Vessel
};

// ---- Actions --------------------------------------------------------------------------------

struct ActionTile {
  const char *label;
  const char *action;
};
const ActionTile ACTION_TILES[] = {
    {"Previous", "prev"},         {"Next", "next"},          {"Black", "black"},
    {"Logo", "logo"},             {"Clear all", "clear-all"}, {"Clear text", "clear"},
    {"Clear media", "clear-media"}, {"Video", "video"},       {"Timer", "timer"},
    {"Reset timer", "timer-reset"}, {"Hide message", "hide-message"}, {"Hide lower third", "hide-lower-third"},
};
const int ACTION_COUNT_TILES = sizeof(ACTION_TILES) / sizeof(ACTION_TILES[0]);
static_assert(ACTION_COUNT_TILES <= MAX_TILES, "MIDI notes are set aside for MAX_TILES tiles");
enum { T_PREV, T_NEXT, T_BLACK, T_LOGO, T_CLEAR_ALL, T_CLEAR, T_CLEAR_MEDIA, T_VIDEO, T_TIMER, T_TIMER_RESET, T_HIDE_MESSAGE, T_HIDE_LOWER };

String actionLabel(const String &action) {
  for (const ActionTile &t : ACTION_TILES)
    if (action == t.action) return t.label;
  return action;
}

void printTiles() {
  for (int i = 0; i < ACTION_COUNT_TILES; i++)
    Console.printf("  %-17s %-17s MIDI note %d\n", ACTION_TILES[i].label, ACTION_TILES[i].action, cfg.midiBase + TILE_NOTE_OFFSET + i);
}

void runTile(int i) { sendAction(ACTION_TILES[i].action, cfg.midiBase + TILE_NOTE_OFFSET + i, String("Tile ") + ACTION_TILES[i].label); }

bool liveTimerShown() { return live.connected && (timerRunning() || live.timerElapsedMs > 0 || live.timerMode == "clock"); }

// An action tile. Shows Black as on, and the timer's time, when Vessel says so.
void actionTile(int i, int x, int y, int w, int h) {
  int id = H_ACT + i;
  bool down = isPressed(id);
  bool on = (i == T_BLACK && live.connected && live.blackout);
  uint16_t fill = on ? rgb(0x3a1d22) : down ? C_PRESSED : C_PANEL2;
  gfx->fillRoundRect(x, y, w, h, 12, fill);
  gfx->drawRoundRect(x, y, w, h, 12, on ? C_LIVE : down ? C_MUTED : C_BORDER);
  String label = ACTION_TILES[i].label;
  String sub;
  if (i == T_BLACK && on) sub = "On";
  if (i == T_TIMER && live.connected && live.timerMode != "clock") {
    label = live.timerStartedAt >= 0 ? "Pause" : live.timerElapsedMs > 0 ? "Resume" : "Start";
    sub = timerText();
  }
  if (sub.length()) {
    textC(fit(label, w - 10, F_BODY_B), x + w / 2, y + h / 2 - 9, F_BODY_B, on ? C_LIVE : C_TEXT);
    textC(sub, x + w / 2, y + h / 2 + 11, F_SMALL, on ? C_LIVE : C_MUTED);
  } else {
    wrapText(label, x + 6, y + h / 2 - (textW(label, F_BODY_B) > w - 12 ? 16 : 7), w - 12, 2, 17, F_BODY_B, C_TEXT, true);
  }
  addHit(id, x, y, w, h, HIT_FAST);
}

// The big Previous / Next pair, side by side.
void prevNext(int y, int h, int prevW) {
  int nx = PAD + prevW + 10, nw = W - PAD - nx;
  bool pd = isPressed(H_ACT + T_PREV), nd = isPressed(H_ACT + T_NEXT);
  gfx->fillRoundRect(PAD, y, prevW, h, 14, pd ? C_PRESSED : C_PANEL2);
  gfx->drawRoundRect(PAD, y, prevW, h, 14, C_BORDER);
  chevron(PAD + prevW / 2, y + h / 2 - (h > 90 ? 12 : 0), h > 90 ? 18 : 14, -1, 4, C_TEXT);
  if (h > 90) textC("Previous", PAD + prevW / 2, y + h - 26, F_BODY_B, C_TEXT);
  addHit(H_ACT + T_PREV, PAD, y, prevW, h, HIT_FAST);
  gfx->fillRoundRect(nx, y, nw, h, 14, nd ? C_ACCENT_PRESSED : C_ACCENT);
  chevron(nx + nw / 2, y + h / 2 - (h > 90 ? 12 : 0), h > 90 ? 22 : 16, 1, 4, C_ON_ACCENT);
  if (h > 90) textC("Next", nx + nw / 2, y + h - 26, F_BIG, C_ON_ACCENT);
  addHit(H_ACT + T_NEXT, nx, y, nw, h, HIT_FAST);
}

// Next above Previous, in a column (landscape).
void prevNextColumn(int x, int y, int w, int nextH, int prevH) {
  bool pd = isPressed(H_ACT + T_PREV), nd = isPressed(H_ACT + T_NEXT);
  gfx->fillRoundRect(x, y, w, nextH, 14, nd ? C_ACCENT_PRESSED : C_ACCENT);
  chevron(x + w / 2, y + nextH / 2 - (nextH > 100 ? 12 : 0), 20, 1, 4, C_ON_ACCENT);
  if (nextH > 100) textC("Next", x + w / 2, y + nextH - 24, F_BIG, C_ON_ACCENT);
  addHit(H_ACT + T_NEXT, x, y, w, nextH, HIT_FAST);
  int py = y + nextH + 8;
  gfx->fillRoundRect(x, py, w, prevH, 14, pd ? C_PRESSED : C_PANEL2);
  gfx->drawRoundRect(x, py, w, prevH, 14, C_BORDER);
  chevron(x + w / 2, py + prevH / 2 - (prevH > 90 ? 10 : 0), 14, -1, 4, C_TEXT);
  if (prevH > 90) textC("Previous", x + w / 2, py + prevH - 22, F_BODY_B, C_TEXT);
  addHit(H_ACT + T_PREV, x, py, w, prevH, HIT_FAST);
}

// ---- Home -------------------------------------------------------------------------------------

// What to do next, before this remote follows Vessel.
void drawSetupCard(int x, int y, int w, int h) {
  card(x, y, w, h);
  String title, body;
  int action = 0;  // 0 none, 1 Wi-Fi, 2 Vessel
  if (cfg.mode == "midi") {
    title = "Sending by USB MIDI";
    body = "Taps go to Vessel as MIDI notes. To see Vessel's slides here, choose Wi-Fi under Settings.";
  } else if (!wifiConfigured()) {
    title = "Connect to Wi-Fi";
    body = "Join the same network as Vessel's computer to see the slides and control Vessel from here.";
    action = 1;
  } else if (!wifiUp()) {
    title = "Joining " + cfg.ssid;
    body = "Waiting for the Wi-Fi network. Check the password under Wi-Fi if this takes long.";
    action = 1;
  } else if (!vesselConfigured()) {
    title = "Set up Vessel";
    body = "In Vessel, open Remote control and turn it on. Then find Vessel here and type its PIN.";
    action = 2;
  } else {
    title = vesselLastCode == 401 ? "Wrong PIN" : vesselLastCode < 0 ? "Can't reach Vessel" : "Connecting to Vessel";
    body = vesselLastCode == 401  ? "The PIN doesn't match. Check it in Vessel's Remote control window."
           : vesselLastCode < 0   ? "Check that Vessel is open with Remote control on, at " + cfg.host + ":" + String(cfg.port) + "."
           : live.problem.length() ? live.problem
                                   : "Signing in to Vessel...";
    action = vesselLastCode == 401 || vesselLastCode < 0 ? 2 : 0;
  }
  gfx->draw16bitRGBBitmap(x + 16, y + 18, (uint16_t *)LOGO_SYMBOL, LOGO_SYMBOL_W, LOGO_SYMBOL_H);
  textL(fit(title, w - 70, F_TITLE), x + 50, y + 31, F_TITLE, C_TEXT);
  int bh = action ? 46 : 0;
  wrapText(body, x + 16, y + 62, w - 32, (h - 62 - bh - 24) / 20, 20, F_BODY, C_MUTED);
  if (action == 1) button(H_HOME_WIFI, x + 16, y + h - 16 - bh, w - 32, bh, "Wi-Fi settings", 1);
  if (action == 2) button(H_HOME_VESSEL, x + 16, y + h - 16 - bh, w - 32, bh, "Set up Vessel", 1);
}

// The badge (LIVE, BLACK, CLEAR), a title and the timer, along the top of the live card.
void liveHeader(int x, int y, int w, const String &title) {
  const char *badge = live.blackout ? "BLACK" : live.cleared ? "CLEAR" : "LIVE";
  bool plain = live.blackout || live.cleared;
  int bw = textW(badge, F_SMALL_B) + 14;
  gfx->fillRoundRect(x, y - 10, bw, 20, 6, plain ? C_BORDER_STRONG : C_LIVE);
  textC(badge, x + bw / 2, y, F_SMALL_B, plain ? C_TEXT : rgb(0xffffff));
  int right = x + w;
  if (liveTimerShown()) {
    String t = timerText();
    textR(t, right, y, F_BODY_B, timerValueMs() < 0 && live.timerMode != "countup" ? C_LIVE : C_ACCENT);
    right -= textW(t, F_BODY_B) + 10;
  }
  textL(fit(title, right - (x + bw + 10), F_BODY_B), x + bw + 10, y, F_BODY_B, C_TEXT);
}

String whereText() {
  if (!live.havePresentation || live.liveIndex < 0) return "";
  String s = "Slide " + String(live.liveIndex + 1) + " of " + String(live.slides.size());
  if (live.liveIndex < (int)live.slides.size() && live.slides[live.liveIndex].group.length()) s += "  -  " + live.slides[live.liveIndex].group;
  return s;
}

// The live slide: its picture when there is one, otherwise its words.
void drawLiveCard(int x, int y, int w, int h) {
  card(x, y, w, h);
  const Picture *pic = live.liveIndex >= 0 ? bigPicture(live.liveIndex, 0) : nullptr;
  if (live.hasNext && live.liveIndex >= 0) bigPicture(live.liveIndex + 1, 1);  // fetch the next one early
  String name = live.havePresentation ? live.presentationName : "Nothing open";
  int inner = w - 24;
  if (pic) {
    liveHeader(x + 12, y + 22, inner, whereText().length() ? whereText() : name);
    int ph = inner * pic->h / pic->w;
    int maxH = h - 46;
    int pw = inner;
    if (ph > maxH) ph = maxH, pw = maxH * pic->w / pic->h;
    int px = x + 12 + (inner - pw) / 2, py = y + 38;
    drawPicture(*pic, px, py, pw, ph);
    if (live.blackout) {  // the audience sees black
      gfx->fillRoundRect(px + pw / 2 - 44, py + ph / 2 - 14, 88, 28, 8, C_BG);
      textC("Black", px + pw / 2, py + ph / 2, F_BODY_B, C_TEXT);
    }
    return;
  }
  liveHeader(x + 12, y + 22, inner, name);
  String where = whereText();
  if (where.length()) textL(fit(where, inner, F_SMALL), x + 12, y + 48, F_SMALL, C_MUTED);
  String words = live.cleared ? "" : live.liveText;
  if (words.length()) wrapText(words, x + 12, y + 62, inner, (h - 70) / 22, 22, F_TITLE, C_TEXT);
  else textL(live.cleared ? "Text cleared" : live.havePresentation ? "Nothing on screen" : "Open a presentation in Vessel", x + 12, y + 76, F_BODY, C_FAINT);
}

// The next slide: a small picture and its words.
void drawNextCard(int x, int y, int w, int h) {
  card(x, y, w, h, C_BG);
  const Picture *pic = live.hasNext && live.liveIndex >= 0 ? smallPicture(live.liveIndex + 1) : nullptr;
  int tx = x + 12;
  if (pic) {
    int ph = min(h - 16, 45), pw = ph * pic->w / pic->h;
    drawPicture(*pic, x + 8, y + (h - ph) / 2, pw, ph);
    tx = x + 8 + pw + 10;
  }
  int tw = x + w - 10 - tx;
  if (tw < 40) return;
  sectionLabel(fit(live.nextGroup.length() ? "Next  -  " + live.nextGroup : "Next", tw, F_SMALL_B), tx, y + 14);
  if (live.hasNext) wrapText(live.nextText.length() ? live.nextText : "(blank)", tx, y + 26, tw, (h - 30) / 18, 18, F_BODY, C_MUTED);
  else textL("End", tx, y + 38, F_BODY, C_FAINT);
}

void drawHome() {
  const int top = CONTENT_Y + 10;
  if (landscape) {
    int colW = 116, leftW = W - 3 * PAD + 2 - colW;
    int colX = PAD + leftW + 10, h = CONTENT_BOTTOM - 10 - top;
    if (!live.connected) {
      drawSetupCard(PAD, top, leftW, h);
      prevNextColumn(colX, top, colW, h * 6 / 10, h - h * 6 / 10 - 8);
      return;
    }
    int nextCardH = 64;
    drawLiveCard(PAD, top, leftW, h);
    int buttonsH = h - nextCardH - 8;
    prevNextColumn(colX, top, colW, buttonsH * 6 / 10, buttonsH - buttonsH * 6 / 10 - 8);
    drawNextCard(colX, top + buttonsH + 8, colW, nextCardH);
    return;
  }
  if (!live.connected) {
    drawSetupCard(PAD, top, W - 2 * PAD, 230);
    prevNext(CONTENT_BOTTOM - 10 - 120, 120, 100);
    return;
  }
  drawLiveCard(PAD, top, W - 2 * PAD, 206);
  drawNextCard(PAD, top + 214, W - 2 * PAD, 70);
  prevNext(CONTENT_BOTTOM - 10 - 66, 66, 86);
}

// ---- Remote -------------------------------------------------------------------------------------

// Message: type a message to show on Vessel's screen.
void messageTile(int x, int y, int w, int h) {
  bool down = isPressed(H_MSG);
  gfx->fillRoundRect(x, y, w, h, 12, down ? C_PRESSED : C_PANEL2);
  gfx->drawRoundRect(x, y, w, h, 12, C_BORDER);
  bool has = live.connected && live.message.length();
  textC("Message", x + w / 2, y + h / 2 - (has ? 9 : 0), F_BODY_B, C_TEXT);
  if (has) textC(fit(live.message, w - 12, F_SMALL), x + w / 2, y + h / 2 + 11, F_SMALL, C_ACCENT);
  addHit(H_MSG, x, y, w, h);
}

void drawRemote() {
  int y = CONTENT_Y + 10;
  int gx = PAD, gw = W - 2 * PAD, gy, gh;
  if (landscape) {
    int colW = 120, h = CONTENT_BOTTOM - 10 - y;
    prevNextColumn(PAD, y, colW, h * 55 / 100, h - h * 55 / 100 - 8);
    gx = PAD + colW + 10, gw = W - PAD - gx, gy = y, gh = h;
  } else {
    prevNext(y, 112, 100);
    gy = y + 122, gh = CONTENT_BOTTOM - 10 - gy;
  }
  const int gap = landscape ? 6 : 8, cols = 3, rows = 4;
  int tw = (gw - gap * (cols - 1)) / cols;
  int th = (gh - gap * (rows - 1)) / rows;
  const int grid[] = {T_BLACK, T_LOGO, T_CLEAR_ALL, T_CLEAR, T_CLEAR_MEDIA, T_VIDEO, T_TIMER, T_TIMER_RESET, -1};
  for (int i = 0; i < 9; i++) {
    int x = gx + (i % cols) * (tw + gap), ty = gy + (i / cols) * (th + gap);
    if (grid[i] >= 0) actionTile(grid[i], x, ty, tw, th);
    else messageTile(x, ty, tw, th);
  }
  int ly = gy + 3 * (th + gap);
  int hw = (gw - gap) / 2;
  actionTile(T_HIDE_MESSAGE, gx, ly, hw, th);
  actionTile(T_HIDE_LOWER, gx + hw + gap, ly, gw - hw - gap, th);
}

// ---- Service: slides and the running order ---------------------------------------------------------

int serviceTab = 0;  // 0 slides, 1 service
uint32_t userScrolledAt = 0;
int lastLiveIndex = -2;
const int SLIDE_ROW = 58, SLIDE_GAP = 6;

void drawEmpty(const String &title, const String &body, int top) {
  textC(title, W / 2, top + 40, F_TITLE, C_TEXT);
  wrapText(body, PAD + 20, top + 64, W - 2 * PAD - 40, 4, 20, F_BODY, C_MUTED, true);
}

void drawService() {
  const int listTop = CONTENT_Y + 56;
  scrollTop = listTop;
  scrollBottom = CONTENT_BOTTOM;
  int viewH = scrollBottom - scrollTop;
  int &scroll = scrollY[PAGE_SERVICE];

  if (!live.connected) {
    drawEmpty("Not connected", "The slides and the service's running order show here once this remote is connected to Vessel over Wi-Fi.", listTop);
  } else if (serviceTab == 0) {
    if (!live.havePresentation || live.slides.empty()) {
      drawEmpty("No slides", "Open a presentation in Vessel, or choose a song under Service.", listTop);
    } else {
      int contentH = live.slides.size() * (SLIDE_ROW + SLIDE_GAP) + 8;
      scrollMax = max(0, contentH - viewH);
      scroll = constrain(scroll, 0, scrollMax);
      for (int i = 0; i < (int)live.slides.size(); i++) {
        int y = listTop + 4 + i * (SLIDE_ROW + SLIDE_GAP) - scroll;
        if (y + SLIDE_ROW < listTop || y > scrollBottom) continue;
        const LiveSlide &s = live.slides[i];
        bool isLive = i == live.liveIndex;
        bool down = isPressed(H_ROW + i);
        gfx->fillRoundRect(PAD, y, W - 2 * PAD, SLIDE_ROW, 10, down ? C_PRESSED : isLive ? C_PANEL2 : C_PANEL);
        gfx->drawRoundRect(PAD, y, W - 2 * PAD, SLIDE_ROW, 10, isLive ? C_LIVE : C_BORDER);
        if (s.colour >= 0) gfx->fillRoundRect(PAD + 4, y + 8, 4, SLIDE_ROW - 16, 2, s.colour);
        int tx = PAD + 16;
        const Picture *pic = smallPicture(i);
        if (picturesMatch()) {  // keep the words lined up while pictures load
          int ph = SLIDE_ROW - 14, pw = pic ? ph * pic->w / pic->h : ph * 16 / 9;
          if (pic) drawPicture(*pic, PAD + 12, y + 7, pw, ph);
          else gfx->fillRect(PAD + 12, y + 7, pw, ph, C_PANEL2);
          tx = PAD + 12 + pw + 10;
        }
        String head = String(i + 1) + (s.group.length() ? "  -  " + s.group : "");
        textL(fit(head, W - PAD - 70 - tx, F_SMALL), tx, y + 16, F_SMALL, isLive ? C_LIVE : C_MUTED);
        if (isLive) textR(live.blackout ? "BLACK" : "LIVE", W - PAD - 12, y + 16, F_SMALL_B, C_LIVE);
        String words = s.text;
        words.replace("\n", " / ");
        textL(fit(words.length() ? words : "(blank)", W - PAD - 12 - tx, F_BODY_B), tx, y + 38, F_BODY_B, words.length() ? C_TEXT : C_FAINT);
        addListHit(H_ROW + i, PAD, y, W - 2 * PAD, SLIDE_ROW);
      }
    }
  } else {
    if (!live.haveService || live.service.empty()) {
      drawEmpty("No service open", "Open a service playlist in Vessel to see its running order here.", listTop);
    } else {
      int y0 = listTop + 4;
      int contentH = 8;
      for (const ServiceItem &it : live.service) contentH += it.header ? 34 : 54;
      scrollMax = max(0, contentH - viewH);
      scroll = constrain(scroll, 0, scrollMax);
      int y = y0 - scroll;
      for (int i = 0; i < (int)live.service.size(); i++) {
        const ServiceItem &it = live.service[i];
        int h = it.header ? 34 : 54;
        if (y + h >= listTop && y <= scrollBottom) {
          if (it.header) {
            sectionLabel(fit(it.name, W - 2 * PAD, F_SMALL_B), PAD + 4, y + 20);
          } else {
            bool down = isPressed(H_ROW + i);
            gfx->fillRoundRect(PAD, y, W - 2 * PAD, 48, 10, down ? C_PRESSED : it.live ? C_PANEL2 : C_PANEL);
            gfx->drawRoundRect(PAD, y, W - 2 * PAD, 48, 10, it.live ? C_LIVE : it.current ? C_ACCENT : C_BORDER);
            int rw = 0;
            if (it.live) {
              textR("LIVE", W - PAD - 12, y + 24, F_SMALL_B, C_LIVE);
              rw = 44;
            } else if (it.current) {
              textR("Open", W - PAD - 12, y + 24, F_SMALL, C_ACCENT);
              rw = 44;
            }
            textL(fit(it.name.length() ? it.name : "Untitled", W - 2 * PAD - 28 - rw, F_BODY_B), PAD + 14, y + 24, F_BODY_B, C_TEXT);
            addListHit(H_ROW + i, PAD, y, W - 2 * PAD, 48);
          }
        }
        y += h;
      }
    }
  }
  // Fixed header over the list.
  gfx->fillRect(0, CONTENT_Y, W, listTop - CONTENT_Y, C_BG);
  const char *labels[] = {"Slides", "Service"};
  segments(H_SEG, PAD, CONTENT_Y + 10, W - 2 * PAD, 38, labels, 2, serviceTab);
}

// Keep the live slide in view, unless the list was just scrolled by hand.
void keepLiveSlideInView(bool force) {
  if (serviceTab != 0 || live.liveIndex < 0) return;
  if (!force && millis() - userScrolledAt < 6000) return;
  int viewH = CONTENT_BOTTOM - (CONTENT_Y + 56);
  int rowTop = 4 + live.liveIndex * (SLIDE_ROW + SLIDE_GAP);
  int &scroll = scrollY[PAGE_SERVICE];
  if (rowTop - SLIDE_ROW < scroll) scroll = max(0, rowTop - SLIDE_ROW);  // show the one before, too
  else if (rowTop + 2 * SLIDE_ROW > scroll + viewH) scroll = rowTop + 2 * SLIDE_ROW - viewH;
}

// ---- Wi-Fi --------------------------------------------------------------------------------------

std::vector<WifiNetwork> networks;
bool scanning = false;
String kbPendingSsid;

void startScan() {
  if (scanning) return;
  if (WiFi.getMode() == WIFI_OFF) WiFi.mode(WIFI_STA);
  WiFi.scanNetworks(true /* async */);
  scanning = true;
}

void collectScan() {
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return;
  scanning = false;
  networks.clear();
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (!ssid.length()) continue;
    bool dup = false;
    for (WifiNetwork &x : networks)
      if (x.ssid == ssid) {
        x.rssi = max(x.rssi, (int)WiFi.RSSI(i));
        dup = true;
      }
    if (!dup) networks.push_back({ssid, (int)WiFi.RSSI(i), WiFi.encryptionType(i) != WIFI_AUTH_OPEN});
  }
  std::sort(networks.begin(), networks.end(), [](const WifiNetwork &a, const WifiNetwork &b) { return a.rssi > b.rssi; });
  WiFi.scanDelete();
  dirty = true;
}

void connectWifi(const String &ssid, const String &pass) {
  cfg.ssid = ssid;
  cfg.wifiPass = pass;
  vesselSettingsChanged();
  saveSettings();
  startWifi();
  toast("Joining " + ssid);
}

// The list scrolls under the fixed part above it (beside it in landscape), so
// draw the list first.
void drawWifi() {
  const int colW = 150;  // landscape: this remote's network on the left
  const int lx = landscape ? PAD + colW + 10 : PAD, lw = W - PAD - lx;
  const int listTop = landscape ? CONTENT_Y + 10 : CONTENT_Y + 172;
  bool up = wifiUp();
  scrollTop = listTop;
  scrollBottom = CONTENT_BOTTOM;
  int viewH = scrollBottom - listTop;
  int &scroll = scrollY[PAGE_WIFI];
  const int ROW = 48, GAP = 6;
  scrollMax = max(0, (int)networks.size() * (ROW + GAP) - viewH + 8);
  scroll = constrain(scroll, 0, scrollMax);
  for (int i = 0; i < (int)networks.size(); i++) {
    int ry = listTop + i * (ROW + GAP) - scroll;
    if (ry + ROW < listTop || ry > scrollBottom) continue;
    const WifiNetwork &n = networks[i];
    bool current = up && n.ssid == cfg.ssid;
    bool down = isPressed(H_ROW + i);
    gfx->fillRoundRect(lx, ry, lw, ROW, 10, down ? C_PRESSED : C_PANEL);
    gfx->drawRoundRect(lx, ry, lw, ROW, 10, current ? C_ACCENT : C_BORDER);
    int right = lx + lw - 14;
    iconWifi(right - 10, ry + ROW / 2 - 4, wifiBars(n.rssi), C_TEXT, C_BORDER_STRONG);
    right -= 30;
    if (n.secure) {
      iconLock(right - 5, ry + ROW / 2 - 1, C_MUTED);
      right -= 20;
    }
    if (current) iconCheck(lx + 18, ry + ROW / 2, C_ACCENT);
    textL(fit(n.ssid, right - (lx + 34), F_BODY_B), lx + 34, ry + ROW / 2, F_BODY_B, current ? C_ACCENT : C_TEXT);
    addListHit(H_ROW + i, lx, ry, lw, ROW);
  }
  if (networks.empty()) textC(scanning ? "Looking for networks..." : "No networks found. Tap Scan.", lx + lw / 2, listTop + 30, F_BODY, C_MUTED);

  String name = cfg.ssid.length() ? cfg.ssid : "Not connected";
  String line2 = up ? WiFi.localIP().toString() : cfg.ssid.length() ? String(wifiStatus()) : "Choose a network";
  if (landscape) {  // the left column
    int y = CONTENT_Y + 10;
    card(PAD, y, colW, 112);
    iconWifi(PAD + 22, y + 20, up ? wifiBars(WiFi.RSSI()) : 0, up ? C_ACCENT : C_FAINT, C_BORDER_STRONG);
    textL(fit(name, colW - 24, F_TITLE), PAD + 12, y + 52, F_TITLE, C_TEXT);
    textL(fit(line2, colW - 24, F_SMALL), PAD + 12, y + 74, F_SMALL, up ? C_OK : C_MUTED);
    if (up) textL(String(WiFi.RSSI()) + " dBm", PAD + 12, y + 94, F_SMALL, C_FAINT);
    y += 120;
    button(H_WIFI_SCAN, PAD, y, colW, 40, scanning ? "Scanning" : "Scan", 0, F_BODY_B);
    button(H_WIFI_OTHER, PAD, y + 46, colW, 40, "Hidden...", 0, F_BODY_B);
    if (cfg.ssid.length()) button(H_WIFI_FORGET, PAD, y + 92, colW, 40, "Forget", 2, F_BODY_B);
    return;
  }
  gfx->fillRect(0, CONTENT_Y, W, listTop - CONTENT_Y, C_BG);
  int y = CONTENT_Y + 10;
  card(PAD, y, W - 2 * PAD, 84);
  iconWifi(PAD + 26, y + 34, up ? wifiBars(WiFi.RSSI()) : 0, up ? C_ACCENT : C_FAINT, C_BORDER_STRONG);
  textL(fit(name, W - 2 * PAD - 70, F_TITLE), PAD + 54, y + 24, F_TITLE, C_TEXT);
  textL(fit(up ? "Connected  -  " + line2 : line2, W - 2 * PAD - 70, F_SMALL), PAD + 54, y + 48, F_SMALL, up ? C_OK : C_MUTED);
  if (up) textL("Signal " + String(WiFi.RSSI()) + " dBm  -  2.4 GHz only", PAD + 54, y + 66, F_SMALL, C_FAINT);
  y += 92;
  button(H_WIFI_SCAN, PAD, y, 92, 40, scanning ? "Scanning" : "Scan", 0, F_BODY_B);
  button(H_WIFI_OTHER, PAD + 100, y, 120, 40, "Hidden...", 0, F_BODY_B);
  if (cfg.ssid.length()) button(H_WIFI_FORGET, PAD + 228, y, W - 2 * PAD - 228, 40, "Forget", 2, F_BODY_B);
  y += 52;
  sectionLabel("Networks nearby", PAD + 4, y + 8);
}

// ---- Settings -------------------------------------------------------------------------------------

const uint16_t DIM_OPTIONS[] = {0, 30, 60, 300};
const char *const DIM_LABELS[] = {"Never", "30 s", "1 min", "5 min"};
const char *const MODE_LABELS[] = {"Auto", "Wi-Fi", "MIDI", "Both"};
const char *const MODES[] = {"auto", "wifi", "midi", "both"};

// A row that opens another page.
void linkRow(int id, int y, int h, const String &title, const String &sub, uint16_t titleColour = C_TEXT) {
  bool down = isPressed(id);
  gfx->fillRoundRect(PAD, y, W - 2 * PAD, h, 12, down ? C_PRESSED : C_PANEL);
  gfx->drawRoundRect(PAD, y, W - 2 * PAD, h, 12, C_BORDER);
  if (sub.length()) {
    textL(title, PAD + 14, y + h / 2 - 9, F_BODY_B, titleColour);
    textL(fit(sub, W - 2 * PAD - 50, F_SMALL), PAD + 14, y + h / 2 + 11, F_SMALL, C_MUTED);
  } else {
    textL(title, PAD + 14, y + h / 2, F_BODY_B, titleColour);
  }
  chevron(W - PAD - 18, y + h / 2, 6, 1, 2, C_MUTED);
  addHit(id, PAD, y, W - 2 * PAD, h);
}

const char *const ORIENT_LABELS[] = {"Portrait", "Landscape", "Flipped"};
const char *const SOUND_LABELS[] = {"Off", "Soft", "Loud"};
const char *const ONOFF_LABELS[] = {"Off", "On"};

void drawSettings() {
  int y = pageTop(66 + 4 * 64 + 2 * 66 + 52 + 54) + 10;
  String sub = vesselConfigured() ? cfg.host + ":" + String(cfg.port) : cfg.host.length() ? "PIN not set" : "Not set up";
  linkRow(H_SET_VESSEL, y, 56, "Vessel", sub);
  y += 66;

  sectionLabel("Send taps by", PAD + 4, y + 6);
  int mode = 0;
  for (int i = 0; i < 4; i++)
    if (cfg.mode == MODES[i]) mode = i;
  segments(H_SET_MODE, PAD, y + 16, W - 2 * PAD, 38, MODE_LABELS, 4, mode);
  y += 64;

  sectionLabel("Screen", PAD + 4, y + 6);
  segments(H_SET_ORIENT, PAD, y + 16, W - 2 * PAD, 38, ORIENT_LABELS, 3, cfg.orientation);
  y += 64;

  sectionLabel("Brightness", PAD + 4, y + 6);
  button(H_SET_DIMMER, PAD, y + 16, 44, 38, "-", 0, F_BIG);
  button(H_SET_BRIGHTER, W - PAD - 44, y + 16, 44, 38, "+", 0, F_BIG);
  int bx = PAD + 56, bw = W - 2 * PAD - 112;
  gfx->fillRoundRect(bx, y + 31, bw, 8, 4, C_PANEL2);
  gfx->fillRoundRect(bx, y + 31, max(8, bw * cfg.backlight / 255), 8, 4, C_ACCENT);
  y += 64;

  sectionLabel("Dim the screen after", PAD + 4, y + 6);
  int dim = 0;
  for (int i = 0; i < 4; i++)
    if (cfg.dimSeconds == DIM_OPTIONS[i]) dim = i;
  segments(H_SET_DIM, PAD, y + 16, W - 2 * PAD, 38, DIM_LABELS, 4, dim);
  y += 66;

  int half = (W - 2 * PAD - 10) / 2;
  sectionLabel("Tap sound", PAD + 4, y + 6);
  segments(H_SET_SOUND, PAD, y + 16, half, 38, SOUND_LABELS, 3, cfg.sound);
  sectionLabel("Slide pictures", PAD + half + 14, y + 6);
  segments(H_SET_PICS, PAD + half + 10, y + 16, half, 38, ONOFF_LABELS, 2, cfg.pictures ? 1 : 0);
  y += 66;

  linkRow(H_SET_ABOUT, y, 44, "About this remote", "");
  y += 52;
  bool down = isPressed(H_SET_RESTART);
  gfx->fillRoundRect(PAD, y, W - 2 * PAD, 44, 12, down ? C_PRESSED : C_PANEL);
  gfx->drawRoundRect(PAD, y, W - 2 * PAD, 44, 12, C_BORDER);
  textL("Restart", PAD + 14, y + 22, F_BODY_B, C_LIVE);
  addHit(H_SET_RESTART, PAD, y, W - 2 * PAD, 44);
}

// ---- Vessel setup ------------------------------------------------------------------------------------

volatile bool finding = false;
volatile int findProgress = 0;
bool findDone = false;
std::vector<FoundVessel> foundVessels;
String checkResult;
uint16_t checkColour = C_MUTED;

void finderTask(void *) {
  IPAddress me = WiFi.localIP();
  uint16_t port = cfg.port;
  std::vector<String> open;
  const int BATCH = 8;
  for (int start = 1; start < 255; start += BATCH) {
    int fds[BATCH], host[BATCH], cnt = 0;
    for (int h = start; h < start + BATCH && h < 255; h++) {
      if (h == me[3]) continue;
      int fd = lwip_socket(AF_INET, SOCK_STREAM, 0);
      if (fd < 0) continue;
      lwip_fcntl(fd, F_SETFL, O_NONBLOCK);
      sockaddr_in a = {};
      a.sin_family = AF_INET;
      a.sin_port = htons(port);
      a.sin_addr.s_addr = (uint32_t)me[0] | (uint32_t)me[1] << 8 | (uint32_t)me[2] << 16 | (uint32_t)h << 24;
      lwip_connect(fd, (sockaddr *)&a, sizeof a);
      fds[cnt] = fd, host[cnt] = h, cnt++;
    }
    bool done[BATCH] = {false};
    uint32_t until = millis() + 400;
    while (millis() < until) {
      fd_set wf;
      FD_ZERO(&wf);
      int maxfd = -1, pending = 0;
      for (int i = 0; i < cnt; i++)
        if (!done[i]) {
          FD_SET(fds[i], &wf);
          maxfd = max(maxfd, fds[i]);
          pending++;
        }
      if (!pending) break;
      timeval tv = {0, 50000};
      if (lwip_select(maxfd + 1, nullptr, &wf, nullptr, &tv) <= 0) continue;
      for (int i = 0; i < cnt; i++) {
        if (done[i] || !FD_ISSET(fds[i], &wf)) continue;
        done[i] = true;
        int err = 0;
        socklen_t len = sizeof err;
        lwip_getsockopt(fds[i], SOL_SOCKET, SO_ERROR, &err, &len);
        if (!err) open.push_back(String(me[0]) + "." + me[1] + "." + me[2] + "." + host[i]);
      }
    }
    for (int i = 0; i < cnt; i++) lwip_close(fds[i]);
    findProgress = min(95, start * 95 / 254);
  }
  // Which of those is Vessel's remote control?
  std::vector<FoundVessel> result;
  for (const String &h : open) {
    HTTPClient http;
    http.setConnectTimeout(800);
    http.setTimeout(1500);
    if (http.begin("http://" + h + ":" + String(port) + "/")) {
      if (http.GET() == 200 && http.getString().indexOf("<title>Vessel Remote</title>") >= 0) result.push_back({h, port});
      http.end();
    }
  }
  foundVessels = result;
  findProgress = 100;
  findDone = true;
  finding = false;
  vTaskDelete(nullptr);
}

void startFinding() {
  if (finding) return;
  if (!wifiUp()) return toast("Join Wi-Fi first", false);
  foundVessels.clear();
  findDone = false;
  findProgress = 0;
  finding = true;
  checkResult = "";
  xTaskCreatePinnedToCore(finderTask, "find-vessel", 8192, nullptr, 1, nullptr, 0);
}

void useVessel(const FoundVessel &v) {
  cfg.host = v.host;
  cfg.port = v.port;
  vesselSettingsChanged();
  saveSettings();
  toast("Using Vessel at " + v.host);
}

void valueRow(int id, int y, const String &label, const String &value, bool missing) {
  bool down = isPressed(id);
  gfx->fillRoundRect(PAD, y, W - 2 * PAD, 46, 12, down ? C_PRESSED : C_PANEL);
  gfx->drawRoundRect(PAD, y, W - 2 * PAD, 46, 12, C_BORDER);
  textL(label, PAD + 14, y + 23, F_BODY_B, C_TEXT);
  textR(fit(value, 170, F_BODY), W - PAD - 30, y + 23, F_BODY, missing ? C_AMBER : C_MUTED);
  chevron(W - PAD - 16, y + 23, 5, 1, 2, C_MUTED);
  addHit(id, PAD, y, W - 2 * PAD, 46);
}

void drawVessel() {
  int y = pageTop(42 + 52 + 52 + 58 + 56 + 110) + 8;
  wrapText("In Vessel, open Remote control and turn it on. It shows the address and PIN.", PAD + 4, y, W - 2 * PAD - 8, 2, 17, F_SMALL, C_MUTED);
  y += 42;
  valueRow(H_V_HOST, y, "Address", cfg.host.length() ? cfg.host : "Not set", !cfg.host.length());
  y += 52;
  valueRow(H_V_PORT, y, "Port", String(cfg.port), false);
  y += 52;
  valueRow(H_V_PIN, y, "PIN", cfg.pin.length() ? "Set" : "Not set", !cfg.pin.length());
  y += 58;
  int bw = (W - 2 * PAD - 10) / 2;
  button(H_V_FIND, PAD, y, bw, 44, finding ? "Looking..." : "Find Vessel", 0);
  button(H_V_CHECK, PAD + bw + 10, y, bw, 44, "Test", 1);
  y += 56;

  // Results
  if (finding) {
    textL("Looking on this network...", PAD + 4, y + 10, F_BODY, C_MUTED);
    gfx->fillRoundRect(PAD, y + 26, W - 2 * PAD, 8, 4, C_PANEL2);
    gfx->fillRoundRect(PAD, y + 26, max(8, (W - 2 * PAD) * findProgress / 100), 8, 4, C_ACCENT);
  } else if (findDone) {
    if (foundVessels.empty()) {
      wrapText("No Vessel found on port " + String(cfg.port) + ". Is Remote control turned on, on the same network?", PAD + 4, y, W - 2 * PAD - 8, 3, 18, F_SMALL,
               C_AMBER);
    } else {
      sectionLabel("Found", PAD + 4, y + 6);
      for (int i = 0; i < (int)foundVessels.size() && i < 2; i++) {
        int ry = y + 16 + i * 46;
        bool chosen = foundVessels[i].host == cfg.host && foundVessels[i].port == cfg.port;
        bool down = isPressed(H_FOUND + i);
        gfx->fillRoundRect(PAD, ry, W - 2 * PAD, 40, 10, down ? C_PRESSED : C_PANEL);
        gfx->drawRoundRect(PAD, ry, W - 2 * PAD, 40, 10, chosen ? C_ACCENT : C_BORDER);
        textL(foundVessels[i].host + ":" + String(foundVessels[i].port), PAD + 14, ry + 20, F_BODY_B, C_TEXT);
        textR(chosen ? "In use" : "Use", W - PAD - 14, ry + 20, F_BODY_B, C_ACCENT);
        addHit(H_FOUND + i, PAD, ry, W - 2 * PAD, 40);
      }
    }
  } else if (checkResult.length()) {
    wrapText(checkResult, PAD + 4, y, W - 2 * PAD - 8, 3, 18, F_BODY, checkColour);
  } else if (live.connected) {
    textL("Connected. Following Vessel live.", PAD + 4, y + 10, F_BODY, C_OK);
  }
}

// ---- About ----------------------------------------------------------------------------------------------

String uptimeText() {
  uint32_t s = millis() / 1000;
  char buf[32];
  if (s >= 86400) snprintf(buf, sizeof buf, "%lud %luh", (unsigned long)(s / 86400), (unsigned long)(s % 86400 / 3600));
  else if (s >= 3600) snprintf(buf, sizeof buf, "%luh %lum", (unsigned long)(s / 3600), (unsigned long)(s % 3600 / 60));
  else snprintf(buf, sizeof buf, "%lum %lus", (unsigned long)(s / 60), (unsigned long)(s % 60));
  return buf;
}

void drawAbout() {
  int y = pageTop(8 + LOGO_SPLASH_H / 2 + 36 + 8 * 21 + 24 + 10) + 8;
  const uint16_t *logo = LOGO_SPLASH;
  // The stacked logo, at half size: every other pixel.
  int lw = LOGO_SPLASH_W / 2, lh = LOGO_SPLASH_H / 2;
  int lx = (W - lw) / 2;
  for (int r = 0; r < lh; r++)
    for (int c = 0; c < lw; c++) gfx->drawPixel(lx + c, y + r, logo[(r * 2) * LOGO_SPLASH_W + c * 2]);
  y += lh + 8;
  textC("Vessel Remote " FIRMWARE_VERSION, W / 2, y + 8, F_TITLE, C_TEXT);
  y += 28;
  card(PAD, y, W - 2 * PAD, 8 * 21 + 22);
  struct {
    const char *k;
    String v;
  } rows[] = {
      {"This remote", wifiUp() ? WiFi.localIP().toString() : "Not on Wi-Fi"},
      {"Wi-Fi", wifiUp() ? cfg.ssid + " (" + String(WiFi.RSSI()) + " dBm)" : String(wifiStatus())},
      {"Vessel", vesselConfigured() ? cfg.host + ":" + String(cfg.port) : "Not set up"},
      {"Live", live.connected ? "Following Vessel" : live.problem.length() ? live.problem : "-"},
      {"Sends by", cfg.mode == "auto" ? (useWifi() ? "Auto (Wi-Fi now)" : "Auto (MIDI now)") : cfg.mode},
      {"Up for", uptimeText()},
      {"Memory", String(ESP.getFreeHeap() / 1024) + " KB + " + String(ESP.getFreePsram() / 1024) + " KB free"},
      {"MAC", WiFi.macAddress()},
  };
  int ry = y + 18;
  for (auto &r : rows) {
    textL(r.k, PAD + 14, ry, F_SMALL, C_MUTED);
    textR(fit(r.v, 180, F_SMALL), W - PAD - 14, ry, F_SMALL, C_TEXT);
    ry += 21;
  }
}

// ---- Keyboard --------------------------------------------------------------------------------------------

KeyboardFor kbFor;
String kbTitle, kbText, kbHint;
bool kbSecret = false, kbShow = false, kbNumeric = false, kbShift = false, kbSymbols = false;
Page kbReturn = PAGE_HOME;
int kbMax = 63;

void openKeyboard(KeyboardFor purpose, const String &title, const String &initial, const String &hint, bool secret, bool numeric, int maxLen = 63) {
  kbFor = purpose;
  kbTitle = title;
  kbText = initial;
  kbHint = hint;
  kbSecret = secret;
  kbShow = false;
  kbNumeric = numeric;
  kbShift = false;
  kbSymbols = false;
  kbMax = maxLen;
  kbReturn = page == PAGE_KEYBOARD ? kbReturn : page;
  showPage(PAGE_KEYBOARD);
}

void key(int id, int x, int y, int w, int h, const String &label, bool special = false, bool on = false) {
  bool down = isPressed(id);
  gfx->fillRoundRect(x, y, w, h, 7, down ? C_ACCENT : on ? C_BORDER_STRONG : special ? C_PANEL : C_PANEL2);
  textC(label, x + w / 2, y + h / 2, label.length() > 1 ? F_SMALL_B : F_LARGE, down ? C_ON_ACCENT : C_TEXT);
  addHit(id, x, y, w, h, HIT_FAST);
}

void backspaceKey(int x, int y, int w, int h) {
  bool down = isPressed(H_KB_BACK);
  gfx->fillRoundRect(x, y, w, h, 7, down ? C_ACCENT : C_PANEL);
  uint16_t c = down ? C_ON_ACCENT : C_TEXT;
  int cx = x + w / 2, cy = y + h / 2;
  thickLine(cx - 10, cy, cx - 4, cy - 7, 2, c);
  thickLine(cx - 10, cy, cx - 4, cy + 7, 2, c);
  gfx->drawFastHLine(cx - 4, cy - 7, 14, c);
  gfx->drawFastHLine(cx - 4, cy + 7, 14, c);
  gfx->drawFastVLine(cx + 10, cy - 7, 15, c);
  thickLine(cx - 1, cy - 3, cx + 5, cy + 3, 2, c);
  thickLine(cx + 5, cy - 3, cx - 1, cy + 3, 2, c);
  addHit(H_KB_BACK, x, y, w, h, HIT_FAST);
}

void keyRow(const char *chars, int y, int h, int x0, int kw, int gap) {
  for (int i = 0; chars[i]; i++) {
    char c = chars[i];
    if (kbShift && c >= 'a' && c <= 'z') c = c - 'a' + 'A';
    key(H_KEY + (uint8_t)c, x0 + i * (kw + gap), y, kw, h, String(c));
  }
}

// Full screen, sized for portrait or landscape.
void drawKeyboard() {
  const int barH = landscape ? 40 : 48;
  gfx->fillRect(0, 0, SW, barH, C_BG);
  textL("Cancel", PAD, barH / 2, F_BODY_B, isPressed(H_KB_CANCEL) ? C_MUTED : C_ACCENT);
  addHit(H_KB_CANCEL, 0, 0, 90, barH);
  textC(fit(kbTitle, SW - 200, F_BODY_B), SW / 2, barH / 2, F_BODY_B, C_TEXT);
  button(H_KB_DONE, SW - PAD - 72, (barH - 32) / 2, 72, 32, kbFor == KB_MESSAGE ? "Show" : "Done", 1, F_BODY_B);
  gfx->drawFastHLine(0, barH - 1, SW, C_BORDER);

  // The text
  int fy = barH + (landscape ? 6 : 10), fh = landscape ? 40 : 52;
  card(PAD, fy, SW - 2 * PAD, fh, C_PANEL2);
  String shown = kbText;
  if (kbSecret && !kbShow) {
    shown = "";
    for (size_t i = 0; i < kbText.length(); i++) shown += '*';
  }
  int fieldW = SW - 2 * PAD - 28 - (kbSecret ? 60 : 0);
  while (shown.length() > 1 && textW(shown, F_LARGE) > fieldW) shown.remove(0, 1);  // show the end of long text
  textL(shown, PAD + 14, fy + fh / 2, F_LARGE, C_TEXT);
  int cx = PAD + 15 + textW(shown, F_LARGE);
  if ((millis() / 500) % 2 == 0) gfx->fillRect(cx, fy + fh / 2 - 12, 2, 24, C_ACCENT);
  if (kbSecret) {
    textR(kbShow ? "Hide" : "Show", SW - PAD - 14, fy + fh / 2, F_SMALL_B, C_ACCENT);
    addHit(H_KB_SHOW, SW - PAD - 70, fy, 70, fh);
  }
  int hintTop = fy + fh + 8;

  if (kbNumeric) {
    const char *keys = "123456789.0";
    int kh = landscape ? 46 : 58, gap = landscape ? 6 : 10, kw = 92;
    int top = SH - 4 * kh - 3 * gap - 8;
    int x0 = (SW - (3 * kw + 2 * gap)) / 2;
    if (kbHint.length() && top - hintTop > 20) wrapText(kbHint, PAD + 4, hintTop, SW - 2 * PAD - 8, (top - hintTop - 4) / 17, 17, F_SMALL, C_MUTED);
    for (int i = 0; i < 11; i++) {
      char c = keys[i];
      if (c == '.' && kbFor != KB_HOST) continue;
      key(H_KEY + (uint8_t)c, x0 + (i % 3) * (kw + gap), top + (i / 3) * (kh + gap), kw, kh, String(c));
    }
    backspaceKey(x0 + 2 * (kw + gap), top + 3 * (kh + gap), kw, kh);
    return;
  }

  // Letters
  const int gap = landscape ? 4 : 3, kh = landscape ? 38 : 46, rowGap = landscape ? 5 : 8;
  const int kw = (SW - 12 - 9 * gap) / 10;
  int x0 = (SW - (10 * kw + 9 * gap)) / 2;
  int top = SH - 5 * kh - 4 * rowGap - 6;
  if (kbHint.length() && top - hintTop > 20) wrapText(kbHint, PAD + 4, hintTop, SW - 2 * PAD - 8, (top - hintTop - 4) / 17, 17, F_SMALL, C_MUTED);
  keyRow("1234567890", top, kh, x0, kw, gap);
  int y = top + kh + rowGap;
  keyRow(kbSymbols ? "!@#$%^&*()" : "qwertyuiop", y, kh, x0, kw, gap);
  y += kh + rowGap;
  keyRow(kbSymbols ? "-_=+:;'\"/" : "asdfghjkl", y, kh, x0 + (kw + gap) / 2, kw, gap);
  y += kh + rowGap;
  int wide = kw + (kw + gap) / 2;
  if (kbSymbols) key(H_KEY + '~', x0, y, wide, kh, "~");
  else key(H_KB_SHIFT, x0, y, wide, kh, kbShift ? "ABC" : "abc", true, kbShift);
  keyRow(kbSymbols ? "[]{}\\,?" : "zxcvbnm", y, kh, x0 + wide + gap, kw, gap);
  backspaceKey(SW - x0 - wide, y, wide, kh);
  y += kh + rowGap;
  int modeW = kw * 2, smallW = kw + kw / 2;
  key(H_KB_MODE, x0, y, modeW, kh, kbSymbols ? "abc" : "#+=", true);
  int spaceX = x0 + modeW + gap, spaceW = SW - x0 - spaceX - 2 * (smallW + gap);
  bool sd = isPressed(H_KB_SPACE);
  gfx->fillRoundRect(spaceX, y, spaceW, kh, 7, sd ? C_ACCENT : C_PANEL2);
  textC("space", spaceX + spaceW / 2, y + kh / 2, F_SMALL, sd ? C_ON_ACCENT : C_MUTED);
  addHit(H_KB_SPACE, spaceX, y, spaceW, kh, HIT_FAST);
  key(H_KEY + '.', spaceX + spaceW + gap, y, smallW, kh, ".");
  key(H_KEY + (kbSymbols ? '<' : '-'), spaceX + spaceW + gap + smallW + gap, y, smallW, kh, kbSymbols ? "<" : "-");
}

// The Vessel address typed as "host" or "host:port" (or a pasted URL).
void setHostFromText(String h) {
  h.trim();
  h.replace("http://", "");
  int slash = h.indexOf('/');
  if (slash > 0) h = h.substring(0, slash);
  int colon = h.indexOf(':');
  if (colon > 0) {
    int p = h.substring(colon + 1).toInt();
    if (p > 0 && p < 65536) cfg.port = p;
    h = h.substring(0, colon);
  }
  cfg.host = h;
}

void keyboardDone() {
  String t = kbText;
  switch (kbFor) {
    case KB_WIFI_NAME:
      t.trim();
      if (!t.length()) return toast("Type the network's name", false);
      kbPendingSsid = t;
      return openKeyboard(KB_WIFI_PASSWORD, "Password", "", "For \"" + t + "\". Leave empty for an open network.", true, false);
    case KB_WIFI_PASSWORD:
      connectWifi(kbPendingSsid, t);
      return showPage(PAGE_WIFI);
    case KB_HOST:
      setHostFromText(t);
      vesselSettingsChanged();
      saveSettings();
      return showPage(PAGE_VESSEL);
    case KB_PORT: {
      int p = t.toInt();
      if (p < 1 || p > 65535) return toast("Ports go from 1 to 65535", false);
      cfg.port = p;
      vesselSettingsChanged();
      saveSettings();
      return showPage(PAGE_VESSEL);
    }
    case KB_PIN:
      t.trim();
      if (!t.length()) {  // the field starts empty so the PIN isn't shown; empty keeps it
        toast("PIN unchanged");
        return showPage(PAGE_VESSEL);
      }
      cfg.pin = t;
      vesselSettingsChanged();
      saveSettings();
      toast("PIN saved");
      return showPage(PAGE_VESSEL);
    case KB_MESSAGE:
      showPage(kbReturn);
      queueCommand(JOB_MESSAGE, 0, t, t.length() ? "Message on screen" : "Message cleared");
      return;
  }
}

void keyboardTap(int id) {
  if (id == H_KB_CANCEL) return showPage(kbReturn);
  if (id == H_KB_DONE) return keyboardDone();
  if (id == H_KB_SHOW) kbShow = !kbShow;
  else if (id == H_KB_SHIFT) kbShift = !kbShift;
  else if (id == H_KB_MODE) kbSymbols = !kbSymbols, kbShift = false;
  else if (id == H_KB_BACK) {
    if (kbText.length()) kbText.remove(kbText.length() - 1);
  } else if (id == H_KB_SPACE) {
    if ((int)kbText.length() < kbMax) kbText += ' ';
  } else if (id >= H_KEY && id < H_KEY + 128) {
    if ((int)kbText.length() < kbMax) kbText += (char)(id - H_KEY);
    kbShift = false;
  }
}

// ---- Called from display.ino -----------------------------------------------------------------------------

void drawPage(Page p) {
  switch (p) {
    case PAGE_HOME: return drawHome();
    case PAGE_REMOTE: return drawRemote();
    case PAGE_SERVICE: return drawService();
    case PAGE_WIFI: return drawWifi();
    case PAGE_SETTINGS: return drawSettings();
    case PAGE_VESSEL: return drawVessel();
    case PAGE_ABOUT: return drawAbout();
    case PAGE_KEYBOARD: return drawKeyboard();
    default: return;
  }
}

void pageTap(Page p, int id) {
  // Action tiles work on any page.
  if (id >= H_ACT && id < H_ACT + ACTION_COUNT_TILES) return runTile(id - H_ACT);
  switch (p) {
    case PAGE_HOME:
      if (id == H_HOME_WIFI) showPage(PAGE_WIFI);
      if (id == H_HOME_VESSEL) showPage(PAGE_VESSEL);
      return;
    case PAGE_REMOTE:
      if (id == H_MSG) {
        if (!live.connected) return toast("Messages need Wi-Fi and Vessel", false);
        openKeyboard(KB_MESSAGE, "Message", live.message, "Shown on Vessel's screen. Leave empty and tap Show to clear it.", false, false, 200);
      }
      return;
    case PAGE_SERVICE:
      if (id == H_SEG || id == H_SEG + 1) {
        serviceTab = id - H_SEG;
        scrollY[PAGE_SERVICE] = 0;
        if (serviceTab == 0) keepLiveSlideInView(true);
        return;
      }
      if (id >= H_ROW) {
        int i = id - H_ROW;
        String what = serviceTab == 0 ? "Slide " + String(i + 1) : (i < (int)live.service.size() ? live.service[i].name : "Item");
        queueCommand(serviceTab == 0 ? JOB_GOTO : JOB_OPEN_ROW, i, "", what);
      }
      return;
    case PAGE_WIFI:
      if (id == H_WIFI_SCAN) return startScan();
      if (id == H_WIFI_OTHER) return openKeyboard(KB_WIFI_NAME, "Network name", "", "Type the name of a hidden network exactly.", false, false, 32);
      if (id == H_WIFI_FORGET) {
        String was = cfg.ssid;
        cfg.ssid = cfg.wifiPass = "";
        vesselSettingsChanged();
        saveSettings();
        startWifi();
        startScan();
        return toast("Forgot " + was);
      }
      if (id >= H_ROW && id - H_ROW < (int)networks.size()) {
        const WifiNetwork &n = networks[id - H_ROW];
        if (wifiUp() && n.ssid == cfg.ssid) return toast("Already connected");
        kbPendingSsid = n.ssid;
        if (!n.secure) return connectWifi(n.ssid, "");
        return openKeyboard(KB_WIFI_PASSWORD, "Password", "", "For \"" + n.ssid + "\". Passwords are case-sensitive.", true, false);
      }
      return;
    case PAGE_SETTINGS:
      if (id == H_SET_VESSEL) return showPage(PAGE_VESSEL);
      if (id == H_SET_ABOUT) return showPage(PAGE_ABOUT);
      if (id == H_SET_RESTART) {
        toast("Restarting");
        render();
        delay(400);
        ESP.restart();
      }
      if (id >= H_SET_MODE && id < H_SET_MODE + 4) {
        cfg.mode = MODES[id - H_SET_MODE];
        saveSettings();
        return;
      }
      if (id >= H_SET_DIM && id < H_SET_DIM + 4) {
        cfg.dimSeconds = DIM_OPTIONS[id - H_SET_DIM];
        saveSettings();
        return;
      }
      if (id >= H_SET_ORIENT && id < H_SET_ORIENT + 3) {
        cfg.orientation = id - H_SET_ORIENT;
        saveSettings();
        applyOrientation();
        return;
      }
      if (id >= H_SET_SOUND && id < H_SET_SOUND + 3) {
        cfg.sound = id - H_SET_SOUND;
        saveSettings();
        playTap();
        return;
      }
      if (id == H_SET_PICS || id == H_SET_PICS + 1) {
        cfg.pictures = id == H_SET_PICS + 1;
        saveSettings();
        return;
      }
      if (id == H_SET_DIMMER || id == H_SET_BRIGHTER) {
        int v = cfg.backlight + (id == H_SET_BRIGHTER ? 35 : -35);
        cfg.backlight = constrain(v, 15, 255);
        saveSettings();
        screenBacklight();
      }
      return;
    case PAGE_VESSEL:
      if (id == H_V_HOST)
        return openKeyboard(KB_HOST, "Vessel's address", cfg.host, "The computer's IP address, such as 192.168.1.20, or its name.local. Add :port if it isn't 4040.",
                            false, false, 63);
      if (id == H_V_PORT) return openKeyboard(KB_PORT, "Port", String(cfg.port), "Vessel uses 4040 unless it was changed.", false, true, 5);
      if (id == H_V_PIN) return openKeyboard(KB_PIN, "Vessel's PIN", "", "The PIN in Vessel's Remote control window.", true, true, 12);
      if (id == H_V_FIND) return startFinding();
      if (id == H_V_CHECK) {
        findDone = false;
        if (!wifiUp()) checkResult = "Join Wi-Fi first.", checkColour = C_AMBER;
        else if (!vesselConfigured()) checkResult = "Set the address and PIN first.", checkColour = C_AMBER;
        else {
          int code = vesselRequest("/api/control");
          bool ok = code == 200;
          checkResult = ok ? "Connected to Vessel." : describeResult(code);
          checkColour = ok ? C_OK : C_LIVE;
          if (ok) liveReset();  // sign in again now that it works
        }
        return;
      }
      if (id >= H_FOUND && id < H_FOUND + (int)foundVessels.size()) return useVessel(foundVessels[id - H_FOUND]);
      return;
    case PAGE_KEYBOARD: return keyboardTap(id);
    default: return;
  }
}

// Swipes: on Home they move the slides (left for next, like turning a page).
// False lets display.ino use it to change tabs.
bool pageSwipe(Page p, int dir) {
  if (p != PAGE_HOME) return false;
  int t = dir < 0 ? T_NEXT : T_PREV;
  pressedId = H_ACT + t;  // light the button it stands for
  pressedUntil = millis() + 200;
  runTile(t);
  return true;
}

void pageOpened(Page p) {
  if (p == PAGE_WIFI && !scanning && networks.empty()) startScan();
  if (p == PAGE_SERVICE) keepLiveSlideInView(true);
  if (p == PAGE_VESSEL) checkResult = "";
}

bool pageShowsClock(Page p) {
  if (p == PAGE_KEYBOARD || p == PAGE_ABOUT) return true;  // cursor, uptime
  return (p == PAGE_HOME || p == PAGE_REMOTE) && liveTimerShown() && timerRunning();
}

void pageLiveChanged() {
  if (live.liveIndex != lastLiveIndex) {
    lastLiveIndex = live.liveIndex;
    if (page == PAGE_SERVICE) keepLiveSlideInView(false);
  }
}

// Checks Vessel now and then (when not following it live), so the status is
// right before the first tap. Stops after a wrong PIN so it doesn't lock
// Vessel's remote out.
void pollVessel() {
  if (cfg.mode == "midi" || !wifiUp() || !vesselConfigured() || live.connected) return;
  if (vesselLastCode == 401) return;
  uint32_t wait = vesselLastCode == 0 ? 0 : vesselLastCode == 429 ? 65000 : vesselOk ? 20000 : 8000;
  if (vesselLastCode != 0 && millis() - vesselLastAt < wait) return;
  vesselRequest("/api/control", nullptr, 800);
}

void pagesLoop() {
  if (scanning) collectScan();
  static bool wasFinding = false;
  if (finding) {
    static int lastProgress = -1;
    if (findProgress != lastProgress) lastProgress = findProgress, dirty = true;
  } else if (wasFinding) {
    dirty = true;
    if (foundVessels.size() == 1 && foundVessels[0].host != cfg.host) useVessel(foundVessels[0]);
  }
  wasFinding = finding;
  if (gesture.scrolling) userScrolledAt = millis();
  pollVessel();
}

#endif
