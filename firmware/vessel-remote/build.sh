#!/bin/sh
# Build the Vessel Remote firmware, and flash it when given "upload".
#   ./build.sh            build only
#   ./build.sh upload     build and flash (finds the board by itself)
#   ./build.sh monitor    open the settings console
set -e
cd "$(dirname "$0")"

FQBN="esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,PartitionScheme=app3M_fat9M_16MB,USBMode=default,CDCOnBoot=default,UploadMode=cdc"

port() {
  p=$(ls /dev/cu.usbmodem* 2>/dev/null | head -1)
  [ -n "$p" ] || { echo "No ESP32 found. Plug it in (or hold BOOT while plugging in)." >&2; exit 1; }
  echo "$p"
}

case "$1" in
  monitor)
    exec arduino-cli monitor -p "$(port)" -c baudrate=115200
    ;;
  upload)
    arduino-cli compile --fqbn "$FQBN" .
    arduino-cli upload -p "$(port)" --fqbn "$FQBN" .
    ;;
  *)
    arduino-cli compile --fqbn "$FQBN" .
    ;;
esac
