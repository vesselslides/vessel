// Pictures of Vessel's slides, for Home and the slides list.
//
// Vessel draws a 640-pixel JPEG of each slide of the presentation on screen
// while a presenter view is watching (live.ino keeps one open), and serves them
// at /api/slides/<key>/<index>.jpg. A background task downloads them and
// decodes each at two sizes: half size (320 wide) for the live and next slide,
// and an eighth (80 wide) for the list. Pages ask for what they show; the task
// fetches those first, then the rest in order.

#if BOARD_JC3248W535

#include <JPEGDEC.h>

// Shared with the picture task; changed under picLock.
SemaphoreHandle_t picLock = xSemaphoreCreateMutex();
String picKey;   // empty: no pictures
int picCount = 0;
String picName;  // the presentation's name, to match it with what's live
std::vector<Picture> smallPics;
std::vector<uint8_t> smallWanted, smallTries;
const int BIG_SLOTS = 3;
Picture bigPics[BIG_SLOTS];
int bigIndex[BIG_SLOTS] = {-1, -1, -1};
uint32_t bigUsed[BIG_SLOTS] = {0};
int wantBig[2] = {-1, -1};
volatile bool picsChanged = false;
int lastPictureCode = 0;  // the last download's HTTP status, for the console
bool picTaskStarted = false;

void lockPics() { xSemaphoreTake(picLock, portMAX_DELAY); }
void unlockPics() { xSemaphoreGive(picLock); }

void freeSmallPics() {
  for (Picture &p : smallPics)
    if (p.px) heap_caps_free(p.px);
  smallPics.clear();
}

// From live.ino, when the presenter view says where the pictures are.
void picturesSetSource(const String &key, int count, const String &name) {
  lockPics();
  if (key != picKey || count != picCount) {
    freeSmallPics();
    picKey = key;
    picCount = key.length() ? count : 0;
    smallPics.assign(picCount, Picture());
    smallWanted.assign(picCount, 0);
    smallTries.assign(picCount, 0);
    for (int &i : bigIndex) i = -1;
    picsChanged = true;
  }
  picName = name;
  unlockPics();
}

// The pictures are of the presentation that's live (same name, same number of slides).
bool picturesMatch() {
  return cfg.pictures && picKey.length() && live.havePresentation && picCount == (int)live.slides.size() && picName == live.presentationName;
}

// The small picture of slide i, or nullptr while it's loading.
const Picture *smallPicture(int i) {
  if (!picturesMatch() || i < 0 || i >= picCount) return nullptr;
  lockPics();
  smallWanted[i] = 1;
  const Picture *p = smallPics[i].px ? &smallPics[i] : nullptr;
  unlockPics();
  return p;
}

// The large picture of slide i (`slot` 0 for the live slide, 1 for the next).
const Picture *bigPicture(int i, int slot) {
  if (!picturesMatch() || i < 0 || i >= picCount) return nullptr;
  lockPics();
  wantBig[slot] = i;
  const Picture *p = nullptr;
  for (int s = 0; s < BIG_SLOTS; s++)
    if (bigIndex[s] == i && bigPics[s].px) {
      bigUsed[s] = millis();
      p = &bigPics[s];
    }
  unlockPics();
  return p;
}

bool picturesChanged() {
  bool c = picsChanged;
  picsChanged = false;
  return c;
}

String picturesSummary() {
  lockPics();
  int have = 0;
  for (const Picture &p : smallPics)
    if (p.px) have++;
  String s = picKey.length() ? String(have) + " of " + String(picCount) + " slides" + (picturesMatch() ? "" : " (not the live presentation)") : "none yet";
  if (lastPictureCode && lastPictureCode != 200) s += ", last download: " + String(lastPictureCode);
  unlockPics();
  return s;
}

// ---- Downloading and decoding -----------------------------------------------------------------

JPEGDEC *jpeg = nullptr;  // big, so made in PSRAM

struct DecodeTarget {
  uint16_t *px;
  int w, h;
};

int jpegDraw(JPEGDRAW *d) {
  DecodeTarget *t = (DecodeTarget *)d->pUser;
  for (int r = 0; r < d->iHeight; r++) {
    int y = d->y + r;
    if (y >= t->h) break;
    int n = min((int)d->iWidth, t->w - d->x);
    if (n > 0) memcpy(t->px + y * t->w + d->x, d->pPixels + r * d->iWidth, n * 2);
  }
  return 1;
}

// Decodes at 1/`div` size (2 or 8) into `out`, using `buffer` when given (it
// must hold 320x240). False if the JPEG can't be read.
bool decodeJpeg(uint8_t *data, int len, int div, Picture &out, uint16_t *buffer) {
  if (!jpeg->openRAM(data, len, jpegDraw)) return false;
  int w = jpeg->getWidth() / div, h = jpeg->getHeight() / div;
  if (w <= 0 || h <= 0 || (buffer && w * h > 320 * 240)) {
    jpeg->close();
    return false;
  }
  uint16_t *px = buffer ? buffer : (uint16_t *)heap_caps_malloc(w * h * 2, MALLOC_CAP_SPIRAM);
  if (!px) {
    jpeg->close();
    return false;
  }
  DecodeTarget t = {px, w, h};
  jpeg->setPixelType(RGB565_LITTLE_ENDIAN);
  jpeg->setUserPointer(&t);
  bool ok = jpeg->decode(0, 0, div == 8 ? JPEG_SCALE_EIGHTH : div == 4 ? JPEG_SCALE_QUARTER : JPEG_SCALE_HALF);
  jpeg->close();
  if (!ok) {
    if (!buffer) heap_caps_free(px);
    return false;
  }
  out = {px, w, h};
  return true;
}

// Downloads slide i's JPEG into PSRAM. Returns its length, or 0. Vessel sends
// the pictures without a length (chunked), so ask for HTTP/1.0 and read until
// it closes.
int fetchJpeg(const String &key, int i, uint8_t *&data) {
  HTTPClient http;
  http.useHTTP10(true);
  http.setConnectTimeout(1500);
  http.setTimeout(3000);
  if (!http.begin(vesselBase() + "/api/slides/" + key + "/" + String(i) + ".jpg")) return 0;
  http.addHeader("Cookie", getCookie());
  int code = http.GET();
  lastPictureCode = code;
  if (code != 200) {
    http.end();
    return 0;
  }
  int expected = http.getSize();  // -1 when not given
  int cap = expected > 0 ? expected : 96 * 1024;
  data = (uint8_t *)heap_caps_malloc(cap, MALLOC_CAP_SPIRAM);
  WiFiClient *s = http.getStreamPtr();
  int got = 0;
  uint32_t until = millis() + 6000;
  while (data && millis() < until && (expected < 0 || got < expected)) {
    int avail = s->available();
    if (!avail) {
      if (!s->connected()) break;
      delay(2);
      continue;
    }
    if (got + avail > cap) {
      if (cap >= 1024 * 1024) break;
      cap = min(cap * 2, 1024 * 1024);
      uint8_t *bigger = (uint8_t *)heap_caps_realloc(data, cap, MALLOC_CAP_SPIRAM);
      if (!bigger) break;
      data = bigger;
    }
    int n = s->read(data + got, min(avail, cap - got));
    if (n > 0) got += n;
  }
  http.end();
  bool ok = data && got > 0 && (expected < 0 || got == expected);
  if (!ok) {
    if (data) heap_caps_free(data);
    data = nullptr;
    lastPictureCode = -100;  // cut short
    return 0;
  }
  return got;
}

void pictureTask(void *) {
  jpeg = new (heap_caps_malloc(sizeof(JPEGDEC), MALLOC_CAP_SPIRAM)) JPEGDEC();
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(30));
    if (!cfg.pictures || !wifiUp() || !getCookie().length()) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    // What to fetch: the live and next slides, then what's on screen, then the rest.
    lockPics();
    String key = picKey;
    int index = -1;
    bool big = false;
    for (int k = 0; k < 2 && index < 0; k++) {
      int w = wantBig[k];
      if (w < 0 || w >= picCount || smallTries[w] >= 3) continue;
      bool have = false;
      for (int s = 0; s < BIG_SLOTS; s++) have |= bigIndex[s] == w;
      if (!have) index = w, big = true;
    }
    for (int i = 0; i < picCount && index < 0; i++)
      if (smallWanted[i] && !smallPics[i].px && smallTries[i] < 3) index = i;
    for (int i = 0; i < picCount && index < 0; i++)
      if (!smallPics[i].px && smallTries[i] < 3) index = i;
    unlockPics();
    if (index < 0 || !key.length()) {
      vTaskDelay(pdMS_TO_TICKS(200));
      continue;
    }

    uint8_t *data = nullptr;
    int len = fetchJpeg(key, index, data);
    lockPics();
    bool stillWanted = key == picKey && index < picCount;
    unlockPics();
    if (!len || !stillWanted) {
      if (data) heap_caps_free(data);
      lockPics();
      if (key == picKey && index < picCount) smallTries[index]++;
      unlockPics();
      vTaskDelay(pdMS_TO_TICKS(400));
      continue;
    }

    Picture small;
    bool smallOk = false;
    {
      lockPics();
      bool needSmall = key == picKey && index < picCount && !smallPics[index].px;
      unlockPics();
      if (needSmall) smallOk = decodeJpeg(data, len, 8, small, nullptr);
    }
    // The big one goes in the least recently used slot (not the one on screen).
    int slot = -1;
    if (big) {
      lockPics();
      uint32_t oldest = UINT32_MAX;
      for (int s = 0; s < BIG_SLOTS; s++) {
        if (bigIndex[s] == wantBig[0] && bigIndex[s] >= 0) continue;
        if (bigUsed[s] < oldest) oldest = bigUsed[s], slot = s;
      }
      if (slot >= 0) bigIndex[slot] = -1;  // not usable while it's rewritten
      unlockPics();
      if (slot >= 0) {
        if (!bigPics[slot].px) bigPics[slot].px = (uint16_t *)heap_caps_malloc(320 * 240 * 2, MALLOC_CAP_SPIRAM);
        Picture p;
        if (bigPics[slot].px && decodeJpeg(data, len, 2, p, bigPics[slot].px)) {
          lockPics();
          if (key == picKey) {
            bigPics[slot] = p;
            bigIndex[slot] = index;
            bigUsed[slot] = millis();
          }
          unlockPics();
        }
      }
    }
    heap_caps_free(data);
    lockPics();
    if (key == picKey && index < picCount) {
      if (smallOk && !smallPics[index].px) smallPics[index] = small;
      else if (smallOk) heap_caps_free(small.px);
      if (!smallOk && !smallPics[index].px) smallTries[index]++;
    } else if (smallOk) {
      heap_caps_free(small.px);
    }
    unlockPics();
    picsChanged = true;
  }
}

void picturesBegin() {
  if (picTaskStarted) return;
  picTaskStarted = true;
  xTaskCreatePinnedToCore(pictureTask, "pictures", 10240, nullptr, 1, nullptr, 0);
}

#else

void picturesBegin() {}

#endif
