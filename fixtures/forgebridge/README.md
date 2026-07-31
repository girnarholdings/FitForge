# ForgeBridge v1 fixtures

The frozen wire examples for the native<->web bridge (docs/IOS-SHELL-CONTRACT.md). Both sides
prove themselves against THESE FILES: the web unit tests parse them with the guards in
apps/web/lib/native/forgeBridge.ts, and the iOS DecodingTests decode them with
ForgeBridgeMessages.swift. Editing a fixture is a bridge-version event, not a refactor —
additive changes only, and both test suites must keep passing.
