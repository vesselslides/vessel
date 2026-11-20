// The touch screen on the Guition JC3248W535: 3.5", 320x480, AXS15231B
// display (QSPI) with AXS15231B capacitive touch (I2C).
//
// This file has the hardware, drawing helpers, status bar, tab bar, touch and
// toasts. The pages themselves are in pages.ino. (Arduino joins .ino files in
// alphabetical order, so this file has to sort before live.ino and pages.ino.)
//
// Each frame is drawn in full into one of two canvases (in PSRAM). Only the rows
// that differ from the frame before are sent to the screen, which is the slow
// part (about 38 ms for all 480 rows at the panel's 32 MHz). While drawing, a
// page lists its tappable areas (hits), so touch always matches the screen.

#if BOARD_JC3248W535

#include <U8g2lib.h>  // before Arduino_GFX, which then takes U8g2 fonts
#include <Arduino_GFX_Library.h>
#include <Wire.h>
#include "logos.h"

// ---- Hardware -----------------------------------------------------------------

const int PIN_BACKLIGHT = 1;
const int PIN_TOUCH_SDA = 4, PIN_TOUCH_SCL = 8;
const uint8_t TOUCH_ADDR = 0x3B;
const int PW = 320, PH = 480;  // the panel, as it's built (portrait)

Arduino_DataBus *bus = new Arduino_ESP32QSPI(45 /* CS */, 47 /* SCK */, 21 /* D0 */, 48 /* D1 */, 40 /* D2 */, 39 /* D3 */);
Arduino_GFX *panel = new Arduino_AXS15231B(bus, GFX_NOT_DEFINED /* RST */, 0 /* rotation */, false /* IPS */, PW, PH, 0, 0, 0, 0,
                                           axs15231b_320480_type1_init_operations, sizeof(axs15231b_320480_type1_init_operations));
Arduino_Canvas *canvases[2] = {new Arduino_Canvas(PW, PH, panel, 0, 0, 0), new Arduino_Canvas(PW, PH, panel, 0, 0, 0)};
Arduino_Canvas *gfx = canvases[0];  // the one being drawn
int backBuffer = 0;
bool needFullFlush = true;

bool screenOk = false;
bool touchOk = false;
bool touchLog = false;
bool touchSwap = false, touchFlipX = false, touchFlipY = false;

// ---- Look ---------------------------------------------------------------------------

constexpr uint16_t rgb(uint32_t hex) { return ((hex >> 8) & 0xF800) | ((hex >> 5) & 0x07E0) | ((hex >> 3) & 0x001F); }
// Vessel's dark theme (src/renderer/src/styles.css)
const uint16_t C_BG = rgb(0x0f161e), C_PANEL = rgb(0x151f2a), C_PANEL2 = rgb(0x1c2835), C_PRESSED = rgb(0x2c3a4a);
const uint16_t C_BORDER = rgb(0x273443), C_BORDER_STRONG = rgb(0x3a4a5c);
const uint16_t C_TEXT = rgb(0xeef0f2), C_MUTED = rgb(0x8f9cab), C_FAINT = rgb(0x5d6b7a);
const uint16_t C_ACCENT = rgb(0xd9b97a), C_ACCENT_PRESSED = rgb(0xb8995c), C_ON_ACCENT = rgb(0x16202b);
const uint16_t C_OK = rgb(0x3fb950), C_LIVE = rgb(0xe5484d), C_AMBER = rgb(0xd29922);

#define F_SMALL u8g2_font_helvR10_tf
#define F_SMALL_B u8g2_font_helvB10_tf
#define F_BODY u8g2_font_helvR12_tf
#define F_BODY_B u8g2_font_helvB12_tf
#define F_TITLE u8g2_font_helvB14_tf
#define F_LARGE u8g2_font_helvR14_tf
#define F_BIG u8g2_font_helvB18_tf
#define F_HUGE u8g2_font_helvB24_tf

// ---- Layout (changes with the orientation) ----------------------------------------
//
// Portrait: status bar on top, tab bar along the bottom.
// Landscape: status bar on top, tabs in a rail down the right-hand side.
// Pages draw in a W-wide area from CONTENT_Y to CONTENT_BOTTOM.

const int STATUS_H = 44;
const int TAB_H = 56;
const int RAIL_W = 72;
const int CONTENT_Y = STATUS_H;
const int PAD = 12;
int SW = PW, SH = PH;  // the screen, as it's turned
int W = PW, H = PH;    // W: width pages draw in; H: screen height
int CONTENT_BOTTOM = PH - TAB_H;
bool landscape = false;

// ---- Navigation and touch state ---------------------------------------------------

Page page = PAGE_HOME;
int scrollY[PAGE_COUNT] = {0};
int scrollMax = 0;                    // for the page drawn last
int scrollTop = 0, scrollBottom = 0;  // its scrolling area (0,0: none)
const int MAX_HITS = 120;
Hit hits[MAX_HITS];
int hitCount = 0;
bool clipHits = false;  // keep page hits inside the content area
int pressedId = -1;
uint32_t pressedUntil = 0;
bool dirty = true;

String toastText;
uint16_t toastColour = C_TEXT;
uint32_t toastUntil = 0;

uint32_t lastTouchAt = 0;
bool dimmed = false;
uint32_t splashUntil = 0;

// Timing, for the `perf` console command.
uint32_t perfDrawUs = 0, perfFlushUs = 0, perfFrames = 0, perfRows = 0;
uint32_t textCalls = 0;

void markDirty() { dirty = true; }

void showPage(Page p) {
  if (p != page) {
    page = p;
    pressedId = -1;
    pageOpened(p);  // pages.ino
  }
  dirty = true;
}

void toast(const String &text, bool ok = true) {
  toastText = text;
  toastColour = ok ? C_TEXT : C_LIVE;
  toastUntil = millis() + (ok ? 1800 : 3500);
  dirty = true;
}

// Turns the screen: 0 portrait, 1 landscape, 2 landscape the other way up.
void applyOrientation() {
  const uint8_t ROT[] = {0, 1, 3};
  uint8_t r = ROT[cfg.orientation % 3];
  for (auto *c : canvases) c->setRotation(r);
  SW = canvases[0]->width();
  SH = canvases[0]->height();
  landscape = SW > SH;
  W = landscape ? SW - RAIL_W : SW;
  H = SH;
  CONTENT_BOTTOM = landscape ? SH : SH - TAB_H;
  for (int &s : scrollY) s = 0;
  needFullFlush = true;
  dirty = true;
}

// ---- Text ------------------------------------------------------------------------------

// Measuring text with the library takes about 2 ms a call, so widths come from a
// cache of each character's advance (the fonts have no kerning). FontMetrics
// is in ui.h.
const int MAX_FONTS = 12;
FontMetrics fontMetrics[MAX_FONTS];

int boundsW(const char *s, const uint8_t *font, int16_t *hOut = nullptr) {
  textCalls++;
  gfx->setFont(font);
  int16_t x1, y1;
  uint16_t w, h;
  gfx->getTextBounds(s, 0, 0, &x1, &y1, &w, &h);
  if (hOut) *hOut = h;
  return w;
}

FontMetrics &metricsFor(const uint8_t *font) {
  for (auto &m : fontMetrics)
    if (m.font == font) return m;
  for (auto &m : fontMetrics)
    if (!m.font) {
      m.font = font;
      m.bar = boundsW("||", font);
      boundsW("H", font, &m.capH);
      memset(m.have, 0, sizeof m.have);
      return m;
    }
  return fontMetrics[0];  // not reached: there are fewer fonts than slots
}

int textW(const String &s, const uint8_t *font) {
  FontMetrics &m = metricsFor(font);
  int w = 0;
  for (size_t i = 0; i < s.length(); i++) {
    uint8_t c = s[i];
    if (c < 32) continue;
    int k = c - 32;
    if (!m.have[k]) {
      char probe[4] = {'|', (char)c, '|', 0};
      m.adv[k] = boundsW(probe, font) - m.bar;
      m.have[k] = true;
    }
    w += m.adv[k];
  }
  return w;
}

// Height of capital letters, for centring text on a line.
int capH(const uint8_t *font) { return metricsFor(font).capH; }

// Text whose baseline is at y.
void text(const String &s, int x, int y, const uint8_t *font, uint16_t colour) {
  gfx->setFont(font);
  gfx->setTextColor(colour);
  gfx->setCursor(x, y);
  gfx->print(s);
}

// Text centred (horizontally on cx, capitals vertically on cy).
void textC(const String &s, int cx, int cy, const uint8_t *font, uint16_t colour) {
  text(s, cx - textW(s, font) / 2, cy + capH(font) / 2, font, colour);
}

// Text left-aligned at x, capitals centred on cy.
void textL(const String &s, int x, int cy, const uint8_t *font, uint16_t colour) { text(s, x, cy + capH(font) / 2, font, colour); }

// Text right-aligned to x, capitals centred on cy.
void textR(const String &s, int x, int cy, const uint8_t *font, uint16_t colour) {
  text(s, x - textW(s, font), cy + capH(font) / 2, font, colour);
}

// Shortened with "..." to fit `w`.
String fit(String s, int w, const uint8_t *font) {
  if (textW(s, font) <= w) return s;
  int budget = w - textW("...", font);
  int used = 0;
  size_t n = 0;
  while (n < s.length()) {
    int cw = textW(String(s[n]), font);
    if (used + cw > budget) break;
    used += cw;
    n++;
  }
  s = s.substring(0, n);
  s.trim();
  return s + "...";
}

// Word-wrapped text in a box. Lines are `lineH` apart, the first baseline at
// top + capH. Stops at maxLines with "...". Returns the number of lines drawn.
int wrapText(const String &s, int x, int top, int w, int maxLines, int lineH, const uint8_t *font, uint16_t colour, bool centred = false) {
  int lines = 0;
  int base = top + capH(font);
  String rest = s;
  while (rest.length() && lines < maxLines) {
    int nl = rest.indexOf('\n');
    String para = nl >= 0 ? rest.substring(0, nl) : rest;
    rest = nl >= 0 ? rest.substring(nl + 1) : "";
    para.trim();
    if (!para.length()) continue;  // blank lines take no room
    while (para.length() && lines < maxLines) {
      // Longest run of words that fits.
      int cut = para.length();
      if (textW(para, font) > w) {
        cut = 0;
        for (int i = 0; i <= (int)para.length(); i++) {
          if (i == (int)para.length() || para[i] == ' ') {
            if (textW(para.substring(0, i), font) <= w) cut = i;
            else break;
          }
        }
        if (cut == 0) {  // one long word: break it
          cut = 1;
          while (cut < (int)para.length() && textW(para.substring(0, cut + 1), font) <= w) cut++;
        }
      }
      String line = para.substring(0, cut);
      para = para.substring(cut);
      para.trim();
      bool last = lines == maxLines - 1 && (para.length() || rest.length());
      if (last) line = fit(line + " " + para, w, font);
      int lx = centred ? x + (w - textW(line, font)) / 2 : x;
      text(line, lx, base + lines * lineH, font, colour);
      lines++;
    }
  }
  return lines;
}

// ---- Shapes and line icons ---------------------------------------------------------------

void thickLine(int x0, int y0, int x1, int y1, int t, uint16_t c) {
  for (int dx = -(t / 2); dx <= (t - 1) / 2; dx++)
    for (int dy = -(t / 2); dy <= (t - 1) / 2; dy++) gfx->drawLine(x0 + dx, y0 + dy, x1 + dx, y1 + dy, c);
}

void chevron(int cx, int cy, int size, int dir, int t, uint16_t c) {
  int tipX = cx + dir * size / 2, backX = cx - dir * size / 2;
  thickLine(backX, cy - size, tipX, cy, t, c);
  thickLine(tipX, cy, backX, cy + size, t, c);
}

void iconHome(int cx, int cy, uint16_t c) {
  thickLine(cx - 10, cy - 1, cx, cy - 10, 2, c);
  thickLine(cx, cy - 10, cx + 10, cy - 1, 2, c);
  gfx->drawRect(cx - 7, cy - 2, 14, 11, c);
  gfx->drawRect(cx - 6, cy - 1, 12, 9, c);
}

void iconRemote(int cx, int cy, uint16_t c) {  // a play button in a frame
  gfx->drawRoundRect(cx - 11, cy - 8, 22, 17, 4, c);
  gfx->drawRoundRect(cx - 10, cy - 7, 20, 15, 3, c);
  gfx->fillTriangle(cx - 3, cy - 4, cx - 3, cy + 4, cx + 4, cy, c);
}

void iconList(int cx, int cy, uint16_t c) {
  for (int i = -1; i <= 1; i++) {
    gfx->fillCircle(cx - 9, cy + i * 7, 1, c);
    thickLine(cx - 4, cy + i * 7, cx + 10, cy + i * 7, 2, c);
  }
}

// Wi-Fi: `bars` 0-3 arcs lit; the rest dim.
void iconWifi(int cx, int cy, int bars, uint16_t on, uint16_t off) {
  gfx->fillCircle(cx, cy + 6, 2, bars > 0 ? on : off);
  for (int i = 1; i <= 3; i++) {
    int r = 4 + i * 4;
    gfx->fillArc(cx, cy + 6, r, r - 2, 225, 315, bars >= i ? on : off);
  }
}

void iconGear(int cx, int cy, uint16_t c) {
  for (int i = 0; i < 8; i++) {
    float a = i * PI / 4;
    thickLine(cx + cosf(a) * 7, cy + sinf(a) * 7, cx + cosf(a) * 10, cy + sinf(a) * 10, 3, c);
  }
  gfx->fillArc(cx, cy, 8, 6, 0, 360, c);
  gfx->drawCircle(cx, cy, 3, c);
}

void iconLock(int cx, int cy, uint16_t c) {
  gfx->fillRoundRect(cx - 5, cy - 1, 10, 8, 1, c);
  gfx->drawArc(cx, cy - 1, 4, 3, 180, 360, c);
}

void iconCheck(int cx, int cy, uint16_t c) {
  thickLine(cx - 6, cy, cx - 2, cy + 4, 2, c);
  thickLine(cx - 2, cy + 4, cx + 6, cy - 5, 2, c);
}

int wifiBars(int rssi) { return rssi >= -60 ? 3 : rssi >= -72 ? 2 : rssi >= -85 ? 1 : 0; }

// A picture (RGB565), scaled to fit a box, nearest pixel.
void drawPicture(const Picture &p, int x, int y, int w, int h) {
  if (!p.px || p.w <= 0 || p.h <= 0) return;
  gfx->startWrite();
  for (int r = 0; r < h; r++) {
    const uint16_t *row = p.px + (r * p.h / h) * p.w;
    for (int c = 0; c < w; c++) gfx->writePixel(x + c, y + r, row[c * p.w / w]);
  }
  gfx->endWrite();
}

// ---- Hits -----------------------------------------------------------------------------------

void addHit(int id, int x, int y, int w, int h, uint8_t flags = 0) {
  if (clipHits) {  // page hits stay inside the content area
    int top = max(y, CONTENT_Y), bottom = min(y + h, CONTENT_BOTTOM);
    int right = min(x + w, W);
    y = top, h = bottom - top, w = right - x;
  }
  if (hitCount >= MAX_HITS || w <= 0 || h <= 0) return;
  hits[hitCount++] = {(int16_t)x, (int16_t)y, (int16_t)w, (int16_t)h, (uint16_t)id, flags};
}

// A hit inside the scrolling list, clipped to what's visible.
void addListHit(int id, int x, int y, int w, int h) {
  int top = max(y, scrollTop), bottom = min(y + h, scrollBottom);
  if (bottom > top) addHit(id, x, top, w, bottom - top);
}

bool isPressed(int id) { return pressedId == id; }

int hitAt(int x, int y) {
  for (int i = hitCount - 1; i >= 0; i--) {  // drawn last is on top
    const Hit &h = hits[i];
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return i;
  }
  return -1;
}

// A page taller than the screen scrolls as a whole: call with its height,
// then draw from the returned top.
int pageTop(int contentH) {
  scrollTop = CONTENT_Y;
  scrollBottom = CONTENT_BOTTOM;
  scrollMax = max(0, contentH - (CONTENT_BOTTOM - CONTENT_Y));
  scrollY[page] = constrain(scrollY[page], 0, scrollMax);
  return CONTENT_Y - scrollY[page];
}

void drawScrollBar() {
  if (scrollMax <= 0 || scrollBottom <= scrollTop) return;
  int viewH = scrollBottom - scrollTop;
  int barH = max(24, viewH * viewH / (viewH + scrollMax));
  int barY = scrollTop + (viewH - barH) * scrollY[page] / scrollMax;
  gfx->fillRoundRect(W - 5, barY, 3, barH, 1, C_BORDER_STRONG);
}

// ---- Common pieces ----------------------------------------------------------------------------

// A button. style: 0 plain, 1 accent (gold), 2 danger outline, 3 selected (segment)
void button(int id, int x, int y, int w, int h, const String &label, int style = 0, const uint8_t *font = F_BODY_B, uint8_t flags = 0) {
  bool down = isPressed(id);
  uint16_t fill, ink, edge;
  switch (style) {
    case 1: fill = down ? C_ACCENT_PRESSED : C_ACCENT, ink = C_ON_ACCENT, edge = fill; break;
    case 2: fill = down ? C_PRESSED : C_PANEL2, ink = C_LIVE, edge = C_BORDER; break;
    case 3: fill = down ? C_PRESSED : C_BORDER_STRONG, ink = C_TEXT, edge = fill; break;
    default: fill = down ? C_PRESSED : C_PANEL2, ink = C_TEXT, edge = C_BORDER;
  }
  gfx->fillRoundRect(x, y, w, h, 10, fill);
  if (edge != fill) gfx->drawRoundRect(x, y, w, h, 10, edge);
  textC(fit(label, w - 12, font), x + w / 2, y + h / 2, font, ink);
  addHit(id, x, y, w, h, flags);
}

// Segmented control: `count` labels, one selected. Ids are baseId + index.
void segments(int baseId, int x, int y, int w, int h, const char *const *labels, int count, int selected) {
  gfx->fillRoundRect(x, y, w, h, 10, C_PANEL2);
  gfx->drawRoundRect(x, y, w, h, 10, C_BORDER);
  int segW = (w - 6) / count;
  for (int i = 0; i < count; i++) {
    int sx = x + 3 + i * segW;
    bool sel = i == selected;
    if (sel || isPressed(baseId + i)) gfx->fillRoundRect(sx, y + 3, segW, h - 6, 8, sel ? C_BORDER_STRONG : C_PRESSED);
    textC(fit(labels[i], segW - 6, sel ? F_SMALL_B : F_SMALL), sx + segW / 2, y + h / 2, sel ? F_SMALL_B : F_SMALL, sel ? C_TEXT : C_MUTED);
    addHit(baseId + i, sx, y, segW, h);
  }
}

// A card background.
void card(int x, int y, int w, int h, uint16_t fill = C_PANEL) {
  gfx->fillRoundRect(x, y, w, h, 12, fill);
  gfx->drawRoundRect(x, y, w, h, 12, C_BORDER);
}

// Small capitals-style label above a section.
void sectionLabel(const String &s, int x, int y) {
  String up = s;
  up.toUpperCase();
  textL(up, x, y, F_SMALL_B, C_FAINT);
}

// ---- Status: what's connected ---------------------------------------------------------------

// The one-line status, and its colour.
void statusLine(String &text, uint16_t &colour) {
  if (cfg.mode == "midi") return (void)(text = "USB MIDI", colour = C_ACCENT);
  if (!wifiConfigured()) return (void)(text = cfg.mode == "auto" ? "USB MIDI" : "No Wi-Fi", colour = cfg.mode == "auto" ? C_ACCENT : C_AMBER);
  if (!wifiUp()) return (void)(text = "Joining Wi-Fi", colour = C_AMBER);
  if (!vesselConfigured()) return (void)(text = "Set up Vessel", colour = C_AMBER);
  if (vesselLastCode == 401) return (void)(text = "Wrong PIN", colour = C_LIVE);
  if (vesselLastCode == 429) return (void)(text = "PIN locked", colour = C_LIVE);
  if (vesselLastCode < 0) return (void)(text = "No Vessel", colour = C_LIVE);
  if (vesselOk || live.connected) return (void)(text = "Connected", colour = C_OK);
  text = "Finding Vessel";
  colour = C_MUTED;
}

const char *pageTitle(Page p) {
  switch (p) {
    case PAGE_REMOTE: return "Remote";
    case PAGE_SERVICE: return "Service";
    case PAGE_WIFI: return "Wi-Fi";
    case PAGE_SETTINGS: return "Settings";
    case PAGE_VESSEL: return "Vessel";
    case PAGE_ABOUT: return "About";
    default: return "";
  }
}

Page parentPage(Page p) { return p == PAGE_VESSEL || p == PAGE_ABOUT ? PAGE_SETTINGS : p; }

enum : uint16_t { H_BACK = 1, H_TAB = 2 /* +0..4 */ };
const Page TABS[] = {PAGE_HOME, PAGE_REMOTE, PAGE_SERVICE, PAGE_WIFI, PAGE_SETTINGS};
const char *const TAB_LABELS[] = {"Home", "Remote", "Service", "Wi-Fi", "Settings"};

void drawStatusBar() {
  gfx->fillRect(0, 0, W, STATUS_H, C_BG);
  if (page == PAGE_HOME) {
    gfx->draw16bitRGBBitmap(PAD, (STATUS_H - LOGO_HEADER_H) / 2 + 1, (uint16_t *)LOGO_HEADER, LOGO_HEADER_W, LOGO_HEADER_H);
  } else if (parentPage(page) != page) {
    chevron(PAD + 6, STATUS_H / 2, 8, -1, 2, isPressed(H_BACK) ? C_MUTED : C_ACCENT);
    textL(pageTitle(page), PAD + 20, STATUS_H / 2, F_TITLE, C_TEXT);
    addHit(H_BACK, 0, 0, 140, STATUS_H);
  } else {
    gfx->draw16bitRGBBitmap(PAD, (STATUS_H - LOGO_SYMBOL_H) / 2, (uint16_t *)LOGO_SYMBOL, LOGO_SYMBOL_W, LOGO_SYMBOL_H);
    textL(pageTitle(page), PAD + LOGO_SYMBOL_W + 10, STATUS_H / 2, F_TITLE, C_TEXT);
  }
  // Right: Vessel status and Wi-Fi strength
  String status;
  uint16_t colour;
  statusLine(status, colour);
  int right = W - PAD;
  bool up = wifiUp();
  iconWifi(right - 10, STATUS_H / 2 - 4, up ? wifiBars(WiFi.RSSI()) : 0, up ? C_TEXT : C_FAINT, C_BORDER_STRONG);
  right -= 28;
  int tw = textW(status, F_SMALL);
  textR(status, right, STATUS_H / 2, F_SMALL, C_MUTED);
  gfx->fillCircle(right - tw - 9, STATUS_H / 2, 4, colour);
  gfx->drawFastHLine(0, STATUS_H - 1, W, C_BORDER);
}

void drawTabIcon(int i, int cx, int cy, uint16_t c) {
  switch (i) {
    case 0: iconHome(cx, cy, c); break;
    case 1: iconRemote(cx, cy, c); break;
    case 2: iconList(cx, cy, c); break;
    case 3: iconWifi(cx, cy - 4, 3, c, c); break;
    case 4: iconGear(cx, cy, c); break;
  }
}

// The tabs: along the bottom, or down the right in landscape.
void drawTabs() {
  if (landscape) {
    gfx->fillRect(W, 0, RAIL_W, SH, C_BG);
    gfx->drawFastVLine(W, 0, SH, C_BORDER);
  } else {
    gfx->fillRect(0, CONTENT_BOTTOM, W, TAB_H, C_BG);
    gfx->drawFastHLine(0, CONTENT_BOTTOM, W, C_BORDER);
  }
  for (int i = 0; i < 5; i++) {
    bool active = parentPage(page) == TABS[i];
    uint16_t c = active ? C_ACCENT : isPressed(H_TAB + i) ? C_TEXT : C_MUTED;
    int x, y, w, h;
    if (landscape) x = W, w = RAIL_W, h = SH / 5, y = i * h;
    else w = W / 5, h = TAB_H, x = i * w, y = CONTENT_BOTTOM;
    drawTabIcon(i, x + w / 2, y + h / 2 - 7, c);
    textC(TAB_LABELS[i], x + w / 2, y + h / 2 + 16, active ? F_SMALL_B : F_SMALL, c);
    addHit(H_TAB + i, x, y, w, h, HIT_FAST);
  }
}

void drawToast() {
  if (millis() > toastUntil || !toastText.length()) return;
  String s = fit(toastText, W - 2 * PAD - 32, F_BODY_B);
  int w = textW(s, F_BODY_B) + 32, h = 40;
  int x = (W - w) / 2, y = CONTENT_BOTTOM - h - 10;
  gfx->fillRoundRect(x, y, w, h, 20, toastColour == C_LIVE ? rgb(0x3a1d22) : C_BORDER_STRONG);
  gfx->drawRoundRect(x, y, w, h, 20, toastColour == C_LIVE ? C_LIVE : C_MUTED);
  textC(s, W / 2, y + h / 2, F_BODY_B, toastColour);
}

// ---- Sending frames to the screen -----------------------------------------------------------

// Sends the frame just drawn, only the rows that changed since the last one
// (unless partial updates are off, or the whole screen changed).
void flushFrame() {
  uint16_t *fb = canvases[backBuffer]->getFramebuffer();
  uint16_t *prev = canvases[backBuffer ^ 1]->getFramebuffer();
  uint32_t rows = 0;
  if (!cfg.partialFlush || needFullFlush) {
    panel->draw16bitRGBBitmap(0, 0, fb, PW, PH);
    rows = PH;
  } else {
    int y = 0;
    while (y < PH) {
      if (!memcmp(fb + y * PW, prev + y * PW, PW * 2)) {
        y++;
        continue;
      }
      int start = y, last = y;
      // Runs of changed rows, joining gaps of up to 16 unchanged rows.
      for (y++; y < PH && y - last <= 16; y++)
        if (memcmp(fb + y * PW, prev + y * PW, PW * 2)) last = y;
      panel->draw16bitRGBBitmap(0, start, fb + start * PW, PW, last - start + 1);
      rows += last - start + 1;
      y = last + 1;
    }
  }
  needFullFlush = false;
  perfRows = rows;
  backBuffer ^= 1;
  gfx = canvases[backBuffer];
}

// The frame on screen now.
uint16_t *shownFrame() { return canvases[backBuffer ^ 1]->getFramebuffer(); }

void drawSplash() {
  gfx->fillScreen(C_BG);
  int top = (SH - LOGO_SPLASH_H - 90) / 2;
  gfx->draw16bitRGBBitmap((SW - LOGO_SPLASH_W) / 2, top, (uint16_t *)LOGO_SPLASH, LOGO_SPLASH_W, LOGO_SPLASH_H);
  textC("Remote", SW / 2, top + LOGO_SPLASH_H + 36, F_TITLE, C_MUTED);
  textC("Version " FIRMWARE_VERSION, SW / 2, SH - 30, F_SMALL, C_FAINT);
  needFullFlush = true;
  flushFrame();
}

void render() {
  uint32_t t0 = micros();
  textCalls = 0;
  gfx->fillScreen(C_BG);
  hitCount = 0;
  scrollTop = scrollBottom = scrollMax = 0;
  if (page == PAGE_KEYBOARD) {
    drawPage(page);  // full screen
  } else {
    clipHits = true;
    drawPage(page);
    clipHits = false;
    drawScrollBar();
    drawStatusBar();
    drawTabs();
  }
  drawToast();
  uint32_t t1 = micros();
  flushFrame();
  perfDrawUs = t1 - t0;
  perfFlushUs = micros() - t1;
  perfFrames++;
}

// ---- Touch --------------------------------------------------------------------------------------

// Reads one touch point in screen coordinates (as the screen is turned).
// False when nothing touches.
bool readTouch(int &x, int &y) {
  static const uint8_t READ_CMD[11] = {0xB5, 0xAB, 0xA5, 0x5A, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00};
  Wire.beginTransmission(TOUCH_ADDR);
  Wire.write(READ_CMD, sizeof(READ_CMD));
  if (Wire.endTransmission() != 0) return false;
  uint8_t b[8];
  if (Wire.requestFrom(TOUCH_ADDR, (uint8_t)8) != 8) return false;
  for (auto &v : b) v = Wire.read();
  uint8_t points = b[1];
  if (points == 0 || points > 2) return false;
  int px = ((b[2] & 0x0F) << 8) | b[3];
  int py = ((b[4] & 0x0F) << 8) | b[5];
  if (touchSwap) std::swap(px, py);
  if (touchFlipX) px = PW - 1 - px;
  if (touchFlipY) py = PH - 1 - py;
  px = constrain(px, 0, PW - 1);
  py = constrain(py, 0, PH - 1);
  switch (cfg.orientation % 3) {  // the canvas's rotations, undone (see Arduino_Canvas::writePixelPreclipped)
    case 1: x = py, y = PW - 1 - px; break;
    case 2: x = PH - 1 - py, y = px; break;
    default: x = px, y = py;
  }
  return true;
}

void activate(int id) {
  playTap();  // audio.ino
  if (id == H_BACK) return showPage(parentPage(page));
  if (id >= H_TAB && id < H_TAB + 5) {
    Page target = TABS[id - H_TAB];
    if (target == page) scrollY[page] = 0;  // tapping the tab you're on goes to the top
    return showPage(target);
  }
  pageTap(page, id);  // pages.ino
  dirty = true;
}

// A swipe: dir -1 when the finger moved left, 1 when it moved right.
void swipe(int dir) {
  if (pageSwipe(page, dir)) return;  // pages.ino: e.g. Home moves the slides
  if (parentPage(page) != page) {
    if (dir > 0) showPage(parentPage(page));  // swipe right to go back
    return;
  }
  int i = 0;
  for (int k = 0; k < 5; k++)
    if (TABS[k] == page) i = k;
  int next = constrain(i - dir, 0, 4);
  if (next != i) showPage(TABS[next]);
}

// Touch gestures: a tap acts on release (or at once on HIT_FAST buttons); a
// vertical drag in a scrolling area scrolls it; a sideways flick is a swipe.
struct {
  bool down = false;
  bool swallow = false;  // the touch that woke the screen
  bool scrolling = false;
  bool swiping = false;
  bool fired = false;  // a HIT_FAST button already acted
  int startX = 0, startY = 0, startScroll = 0;
  int hit = -1;  // index into hits at touch-down
} gesture;

void touchDown(int x, int y) {
  lastTouchAt = millis();
  if (dimmed) {
    dimmed = false;
    screenBacklight();
    gesture.swallow = true;
    return;
  }
  gesture.swallow = gesture.scrolling = gesture.swiping = gesture.fired = false;
  gesture.startX = x, gesture.startY = y;
  gesture.startScroll = scrollY[page];
  int i = hitAt(x, y);
  gesture.hit = i;
  if (i < 0) return;
  pressedId = hits[i].id;
  dirty = true;
  if (hits[i].flags & HIT_FAST) {
    int id = hits[i].id;
    pressedUntil = millis() + 160;
    gesture.fired = true;
    gesture.hit = -1;
    render();  // show the press at once
    activate(id);
  }
}

void touchMove(int x, int y) {
  lastTouchAt = millis();
  if (gesture.swallow || gesture.fired) return;
  int dx = x - gesture.startX, dy = y - gesture.startY;
  bool inScroll = scrollBottom > scrollTop && gesture.startY >= scrollTop && gesture.startY < scrollBottom;
  if (!gesture.scrolling && !gesture.swiping) {
    if (inScroll && scrollMax > 0 && abs(dy) > 10 && abs(dy) >= abs(dx)) gesture.scrolling = true;
    else if (page != PAGE_KEYBOARD && abs(dx) > 18 && abs(dx) > abs(dy) * 3 / 2) gesture.swiping = true;
    if (gesture.scrolling || gesture.swiping) {
      pressedId = -1;
      gesture.hit = -1;
      dirty = true;
    }
  }
  if (gesture.scrolling) {
    int s = constrain(gesture.startScroll - dy, 0, scrollMax);
    if (s != scrollY[page]) {
      scrollY[page] = s;
      dirty = true;
    }
  }
}

void touchUp(int x, int y) {
  if (gesture.swiping && !gesture.swallow) {
    gesture.swiping = false;
    if (abs(x - gesture.startX) >= 60) {
      playTap();
      swipe(x < gesture.startX ? -1 : 1);
    }
    return;
  }
  if (gesture.swallow || gesture.scrolling) {
    gesture.swallow = gesture.scrolling = false;
    return;
  }
  int i = gesture.hit;
  gesture.hit = -1;
  if (i < 0 || i >= hitCount) return;
  const Hit &h = hits[i];
  int id = h.id;
  bool inside = x >= h.x - 12 && x < h.x + h.w + 12 && y >= h.y - 12 && y < h.y + h.h + 12;
  pressedUntil = millis() + 120;
  if (inside) activate(id);
}

void pollTouch() {
  static uint32_t lastRead = 0;
  static int lastX = 0, lastY = 0;
  if (!touchOk || millis() - lastRead < 16) return;
  lastRead = millis();
  int x, y;
  bool down = readTouch(x, y);
  if (down && touchLog) Console.printf("touch x=%d y=%d\n", x, y);
  if (down && !gesture.down) touchDown(x, y);
  else if (down) touchMove(x, y);
  else if (gesture.down) touchUp(lastX, lastY);
  if (down) lastX = x, lastY = y;
  gesture.down = down;
}

// Simulated touches from the console, for testing without a finger.
void simulateTap(int x, int y) {
  if (dirty) render();  // make sure the hits match the screen
  touchDown(x, y);
  gesture.down = true;
  if (dirty) render();
  touchUp(x, y);
  gesture.down = false;
}

void simulateSwipe(int x0, int y0, int x1, int y1) {
  if (dirty) render();
  touchDown(x0, y0);
  gesture.down = true;
  for (int k = 1; k <= 6; k++) touchMove(x0 + (x1 - x0) * k / 6, y0 + (y1 - y0) * k / 6);
  touchUp(x1, y1);
  gesture.down = false;
}

// ---- Settings ------------------------------------------------------------------------------------

void loadTouchSettings() {
  Preferences p;
  p.begin("screen", true);
  touchSwap = p.getBool("swap", false);
  touchFlipX = p.getBool("fx", false);
  touchFlipY = p.getBool("fy", false);
  p.end();
}

void saveTouchSettings() {
  Preferences p;
  p.begin("screen", false);
  p.putBool("swap", touchSwap);
  p.putBool("fx", touchFlipX);
  p.putBool("fy", touchFlipY);
  p.end();
}

// ---- Console: screen commands -----------------------------------------------------------------------

// Sends what's on screen as base64 RGB565 (little-endian), as the panel holds it
// (portrait; tools/screenshot.py turns it), for tools/screenshot.py.
void sendScreenshot() {
  if (dirty) render();
  static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const uint8_t *data = (const uint8_t *)shownFrame();
  size_t len = (size_t)PW * PH * 2;
  Console.printf("SCREENSHOT %d %d %d\n", PW, PH, cfg.orientation % 3);
  char line[80];
  for (size_t i = 0; i < len;) {
    int n = 0;
    for (int k = 0; k < 19 && i < len; k++, i += 3) {  // 57 bytes -> 76 characters
      uint32_t v = data[i] << 16 | (i + 1 < len ? data[i + 1] << 8 : 0) | (i + 2 < len ? data[i + 2] : 0);
      line[n++] = B64[(v >> 18) & 63];
      line[n++] = B64[(v >> 12) & 63];
      line[n++] = i + 1 < len ? B64[(v >> 6) & 63] : '=';
      line[n++] = i + 2 < len ? B64[v & 63] : '=';
    }
    line[n++] = '\n';
    Console.write((const uint8_t *)line, n);
  }
  Console.println("END");
}

const char *const PAGE_NAMES[] = {"home", "remote", "service", "wifi", "settings", "vessel", "about", "keyboard"};

bool screenConsole(String *t, int n) {
  String cmd = t[0];
  if (cmd == "screenshot") return sendScreenshot(), true;
  if (cmd == "perf") {
    render();
    Console.printf("Page %s: draw %lu ms (%lu text measures), send %lu ms (%lu of %d rows), %lu frames so far\n", PAGE_NAMES[page], perfDrawUs / 1000,
                   textCalls, perfFlushUs / 1000, perfRows, PH, perfFrames);
    return true;
  }
  if (cmd == "tap" && n == 3) {
    simulateTap(t[1].toInt(), t[2].toInt());
    Console.printf("Tapped %d,%d\n", t[1].toInt(), t[2].toInt());
    return true;
  }
  if (cmd == "swipe" && n == 5) {
    simulateSwipe(t[1].toInt(), t[2].toInt(), t[3].toInt(), t[4].toInt());
    return Console.println("Swiped"), true;
  }
  if (cmd == "page" && n == 2) {
    for (int i = 0; i < PAGE_KEYBOARD; i++)
      if (t[1] == PAGE_NAMES[i]) return showPage((Page)i), Console.printf("Showing %s\n", PAGE_NAMES[i]), true;
    return Console.println("Pages: home, remote, service, wifi, settings, vessel, about"), true;
  }
  if (cmd == "backlight") {
    int v = n > 1 ? t[1].toInt() : 0;
    if (v < 10 || v > 255) return Console.println("Type: backlight 10-255"), true;
    cfg.backlight = v;
    saveSettings();
    screenBacklight();
    return true;
  }
  if (cmd == "rotate") {
    String a = n > 1 ? t[1] : "";
    int o = a == "portrait" ? 0 : a == "landscape" ? 1 : a == "flipped" ? 2 : -1;
    if (o < 0) return Console.println("Type: rotate portrait | landscape | flipped"), true;
    cfg.orientation = o;
    saveSettings();
    applyOrientation();
    return Console.printf("Screen %s\n", a.c_str()), true;
  }
  if (cmd == "partial") {
    String a = n > 1 ? t[1] : "";
    if (a != "on" && a != "off") return Console.println("Type: partial on | off  (send only changed rows to the screen)"), true;
    cfg.partialFlush = a == "on";
    saveSettings();
    needFullFlush = true;
    dirty = true;
    return Console.printf("Partial screen updates %s\n", a.c_str()), true;
  }
  if (cmd == "tiles") return printTiles(), true;
  if (cmd == "touch") {
    String a = n > 1 ? t[1] : "", b = n > 2 ? t[2] : "";
    if (a == "log") {
      touchLog = !touchLog;
      return Console.println(touchLog ? "Logging touches. Type 'touch log' again to stop." : "Stopped logging touches."), true;
    }
    if (a == "swap") touchSwap = !touchSwap;
    else if (a == "flip" && b == "x") touchFlipX = !touchFlipX;
    else if (a == "flip" && b == "y") touchFlipY = !touchFlipY;
    else return Console.println("Type: touch log | touch swap | touch flip x | touch flip y"), true;
    saveTouchSettings();
    Console.printf("Touch: swap %s, flip x %s, flip y %s\n", touchSwap ? "on" : "off", touchFlipX ? "on" : "off", touchFlipY ? "on" : "off");
    return true;
  }
  return false;
}

// ---- Called from vessel-remote.ino ---------------------------------------------------------------------

void screenBacklight() { analogWrite(PIN_BACKLIGHT, dimmed ? max(6, cfg.backlight / 10) : cfg.backlight); }

void screenBegin() {
  loadTouchSettings();
  pinMode(PIN_BACKLIGHT, OUTPUT);
  digitalWrite(PIN_BACKLIGHT, LOW);  // dark until the first frame is drawn
  screenOk = canvases[0]->begin() && canvases[1]->begin(GFX_SKIP_OUTPUT_BEGIN);
  if (screenOk) {
    applyOrientation();
    drawSplash();
    screenBacklight();
    splashUntil = millis() + 1600;
  }
  Wire.begin(PIN_TOUCH_SDA, PIN_TOUCH_SCL, 400000);
  Wire.beginTransmission(TOUCH_ADDR);
  touchOk = Wire.endTransmission() == 0;
  lastTouchAt = millis();
  pageOpened(page);
}

// After an action is sent (vessel-remote.ino).
void screenResult(const String &action, bool ok, const String &message) {
  if (!ok) playError();  // audio.ino
  toast(ok && action.length() ? actionLabel(action) : message, ok);
}

void screenLoop() {
  if (!screenOk) return;
  static bool reported = false;
  if (!reported && millis() > 1500) {  // after the console has had time to attach
    reported = true;
    if (!touchOk) Console.printf("\nThe touch controller didn't answer at 0x%02X (SDA %d, SCL %d).\n> ", TOUCH_ADDR, PIN_TOUCH_SDA, PIN_TOUCH_SCL);
  }
  if (splashUntil) {
    if (millis() < splashUntil) return;
    splashUntil = 0;
    needFullFlush = true;
    dirty = true;
  }

  pollTouch();
  pagesLoop();  // pages.ino: Wi-Fi scans, Vessel finder, checking Vessel
  if (picturesChanged()) dirty = true;  // pictures.ino

  // Dim when nobody has touched it for a while.
  if (cfg.dimSeconds && !dimmed && millis() - lastTouchAt > cfg.dimSeconds * 1000UL) {
    dimmed = true;
    screenBacklight();
  }

  if (pressedId >= 0 && !gesture.down && millis() > pressedUntil) {
    pressedId = -1;
    dirty = true;
  }
  if (toastUntil && millis() > toastUntil) {
    toastUntil = 0;
    dirty = true;
  }

  // Redraw when something shown would change.
  static String lastStatus;
  static uint16_t lastColour;
  static uint32_t lastVersion = 0, lastSecond = 0;
  static int lastBars = -1;
  String status;
  uint16_t colour;
  statusLine(status, colour);
  int bars = wifiUp() ? wifiBars(WiFi.RSSI()) : -1;
  if (status != lastStatus || colour != lastColour || bars != lastBars || live.version != lastVersion) {
    lastStatus = status, lastColour = colour, lastBars = bars, lastVersion = live.version;
    pageLiveChanged();  // pages.ino: e.g. keep the live slide in view
    dirty = true;
  }
  uint32_t second = millis() / 1000;
  if (second != lastSecond) {  // clocks and timers
    lastSecond = second;
    if (pageShowsClock(page)) dirty = true;
  }
  if (dirty) {
    dirty = false;
    render();
  }
}

#else  // no screen

bool touchLog = false;
void screenBegin() {}
void screenLoop() {}
void screenBacklight() {}
void screenResult(const String &, bool, const String &) {}
void printTiles() {}
bool screenConsole(String *, int) { return false; }

#endif
