# 33 — Mobile Distribution & Release Strategy

## Goal

Provide a first-class native mobile app while keeping distribution flexible during development and before store publication.

## Mobile technology direction

Use a shared cross-platform mobile architecture compatible with React Native/Expo where it fits the final stack.

The mobile app must consume the same authoritative backend APIs and business rules as customer web. Never duplicate pricing, availability, authorization, or payment truth inside the mobile client.

## Distribution stages

### Stage A — Development

- Replit mobile project
- Expo Go for rapid device feedback where supported
- Android emulator / iOS simulator
- Test real devices early for camera, location, notifications, deep links, permissions, and keyboard behavior

### Stage B — Private Android distribution

Provide an official download page on the main website with:

- current Android version
- release notes
- checksum/signature information where appropriate
- minimum supported Android version
- installation instructions
- security/support contact

An Android APK can be offered directly from the official site for controlled/private distribution. This must be treated as a release artifact with versioning and integrity verification, not an ad-hoc file upload.

### Stage C — Test distribution

Use store/testing channels when they provide better controlled updates and tester management.

### Stage D — Public Google Play

Publish the Android app to Google Play when the product is stable, the developer account and verification requirements are complete, the store listing is ready, and release testing has passed.

### Stage E — iOS TestFlight / App Store

Use Apple's official distribution path for the iOS native app. TestFlight is the beta channel; App Store is the public channel.

Do not plan to distribute an arbitrary unsigned `.ipa` from the website as the normal public iOS installation path. iOS distribution is controlled by Apple's signing/provisioning and distribution mechanisms.

## Website download center

The public website should contain a dedicated **Apps & Downloads** page:

- Android download
- TestFlight link when active
- App Store link when published
- version number
- release date
- What's new
- required OS version
- support/FAQ

The download center must make it obvious whether a build is production, beta, or internal.

## Release channels

Maintain explicit channels:

- internal
- beta
- production

A release must never accidentally point production users to an internal build.

## Versioning

Use consistent semantic/product versioning and platform build numbers. A mobile release must identify:

- app version
- build number
- API compatibility requirement
- release channel
- minimum supported OS

## Update strategy

The backend must remain compatible with supported app versions for a controlled migration window.

The app should be able to display:

- optional update available
- recommended update
- mandatory update for security/incompatible versions

Mandatory update policy must be server-controlled but fail safely when the update service is unavailable.

## Deep links

Plan deep links for:

- booking confirmation
- vehicle details
- branch/location
- support tickets
- account verification
- password reset
- promotional/referral links

The domain model should support both web URLs and app routes.

## Push notifications

Use a centralized notification service so the same event can target web, push, email, or other configured channels.

Mobile push registration must support token rotation, logout, device removal, and multiple devices per customer/staff account.

## Native capabilities

The architecture should allow controlled access to:

- camera/photo capture for inspections and documents
- GPS/location where consented and necessary
- push notifications
- secure local storage for tokens
- QR scanning
- file/document sharing where appropriate

Permission requests must occur in context and be explainable to the user.

## Release quality gate

Before public release:

- authentication verified
- booking flow verified
- payment flow verified
- notifications verified
- deep links verified
- camera/GPS/QR flows verified where enabled
- RTL and Arabic verified
- French verified
- English verified
- offline/error states verified
- accessibility basics verified
- crash/error monitoring verified
- API compatibility verified
- E2E critical journeys passed

## Store account planning

Current official guidance indicates Google Play registration has a one-time USD 25 registration fee, while Apple Developer Program membership is USD 99 per year (or local-currency equivalent where available). These fees and policies can change and must be rechecked at release time.

## Important separation

The customer mobile app and the agency-owner SaaS/admin surface are distinct product surfaces even though they share one backend. The mobile distribution strategy must not force the agency administration workflow into the consumer app.