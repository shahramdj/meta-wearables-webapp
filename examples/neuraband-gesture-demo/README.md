# Neuraband Gesture Demo — Meta Display Example

A compact demo app that visualizes common Neuraband gesture inputs on-screen with simple, immediate feedback.

## Features

- Gesture cards for:
  - Swipe Up
  - Swipe Down
  - Swipe Left
  - Swipe Right
  - Tap
  - Double Tap
  - Pinch Open
  - Pinch Close
  - Hold
  - Release
- Real-time counters and highlighted gesture cards
- Activity feed showing the latest detected events
- Keyboard simulation fallback for desktop testing

## Input events listened for

- `neurabandgesture`
- `neurobandgesture`
- `emggesture`
- `gesturecontrol`

The app reads gesture names from event payload fields such as `detail.gesture`, `detail.name`, and `detail.type`.

## Desktop simulation keys

- Arrow keys: swipe gestures
- Enter: tap
- Space: double tap
- Z: pinch open
- X: pinch close
- H: hold
- R: release

## Run

Open `index.html` in a browser, or serve the folder with any static server.
