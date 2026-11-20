// Tap feedback: a click from the board's speaker (I2S amplifier; plug a small
// speaker into the 2-pin "SPK" connector) and/or a short buzz from a vibration
// motor on a spare pin (through a transistor; a motor draws too much for a pin).
// Sounds play in their own task, so a tap never waits for them.

#if BOARD_JC3248W535

#include <ESP_I2S.h>

const int PIN_I2S_BCLK = 42, PIN_I2S_WS = 2, PIN_I2S_DOUT = 41;
const int AUDIO_RATE = 22050;

I2SClass i2s;
QueueHandle_t soundQueue;
bool audioOk = false;
enum : uint8_t { SOUND_TAP, SOUND_ERROR, SOUND_TEST };

// A tone with a quick fade, added to `buf`.
int tone(int16_t *buf, int at, int hz, int ms, int amp) {
  int n = AUDIO_RATE * ms / 1000;
  for (int i = 0; i < n; i++) {
    float fade = 1.0f - (float)i / n;
    buf[at + i] = (int16_t)(amp * fade * fade * sinf(2 * PI * hz * i / AUDIO_RATE));
  }
  return at + n;
}

void audioTask(void *) {
  static int16_t buf[AUDIO_RATE / 2];  // up to half a second
  for (;;) {
    uint8_t s;
    if (xQueueReceive(soundQueue, &s, portMAX_DELAY) != pdTRUE) continue;
    int amp = cfg.sound == 2 ? 14000 : cfg.sound == 1 ? 4000 : 0;
    if (s == SOUND_TEST && !amp) amp = 4000;
    if (cfg.vibratePin >= 0) digitalWrite(cfg.vibratePin, HIGH);
    if (audioOk && amp) {
      int n = 0;
      memset(buf, 0, sizeof buf);
      if (s == SOUND_TAP) n = tone(buf, 0, 2400, 7, amp);
      else if (s == SOUND_ERROR) n = tone(buf, tone(buf, 0, 330, 90, amp) + AUDIO_RATE / 25, 260, 120, amp);
      else n = tone(buf, tone(buf, 0, 660, 120, amp), 880, 160, amp);
      i2s.write((uint8_t *)buf, n * 2);
    }
    vTaskDelay(pdMS_TO_TICKS(s == SOUND_ERROR ? 80 : 25));
    if (cfg.vibratePin >= 0) digitalWrite(cfg.vibratePin, LOW);
  }
}

void audioBegin() {
  if (cfg.vibratePin >= 0) {
    pinMode(cfg.vibratePin, OUTPUT);
    digitalWrite(cfg.vibratePin, LOW);
  }
  i2s.setPins(PIN_I2S_BCLK, PIN_I2S_WS, PIN_I2S_DOUT);
  audioOk = i2s.begin(I2S_MODE_STD, AUDIO_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
  soundQueue = xQueueCreate(4, 1);
  xTaskCreatePinnedToCore(audioTask, "sound", 4096, nullptr, 1, nullptr, 0);
}

void playSound(uint8_t s) {
  if (!soundQueue || (!cfg.sound && cfg.vibratePin < 0 && s != SOUND_TEST)) return;
  xQueueSend(soundQueue, &s, 0);  // if sounds pile up, drop this one
}

void playTap() { playSound(SOUND_TAP); }
void playError() { playSound(SOUND_ERROR); }

// Console: sound off|soft|loud|test, vibrate <pin>|off
bool audioConsole(String *t, int n) {
  if (t[0] == "sound") {
    String a = n > 1 ? t[1] : "";
    if (a == "test") return playSound(SOUND_TEST), Console.println(audioOk ? "Playing a test sound" : "The speaker didn't start"), true;
    int v = a == "off" ? 0 : a == "soft" ? 1 : a == "loud" ? 2 : -1;
    if (v < 0) return Console.println("Type: sound off | soft | loud | test"), true;
    cfg.sound = v;
    saveSettings();
    return Console.printf("Tap sound %s\n", a.c_str()), true;
  }
  if (t[0] == "vibrate") {
    String a = n > 1 ? t[1] : "";
    int p = a.toInt();
    if (a == "off") {
      if (cfg.vibratePin >= 0) digitalWrite(cfg.vibratePin, LOW);
      cfg.vibratePin = -1;
    } else if (a.length() && isDigit(a[0]) && p >= 0 && p <= 48) {
      if (pinReserved(p)) return Console.printf("GPIO %d is used by this board; free ones are 6, 7, 9, 14, 15, 16, 17 and 18.\n", p), true;
      for (auto &b : buttons)
        if (b.pin == p) return Console.printf("A button uses GPIO %d.\n", p), true;
      cfg.vibratePin = p;
      pinMode(p, OUTPUT);
      digitalWrite(p, LOW);
    } else {
      return Console.println("Type: vibrate <GPIO> | off  (drive the motor through a transistor)"), true;
    }
    saveSettings();
    return Console.printf("Vibration %s\n", cfg.vibratePin >= 0 ? ("on GPIO " + String(cfg.vibratePin)).c_str() : "off"), true;
  }
  return false;
}

#else

void audioBegin() {}
void playTap() {}
void playError() {}
bool audioConsole(String *, int) { return false; }

#endif
