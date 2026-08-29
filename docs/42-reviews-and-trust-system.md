# 42 — Reviews, Ratings & Trust System

## Goal

Build a trustworthy reputation layer for the marketplace without allowing reviews to become a source of fraud, harassment, or unverified claims.

## Agency reviews

Only customers with an eligible booking/rental relationship may submit a review for an agency.

Eligibility should be defined by policy, for example:
- booking reached a qualifying state
- sufficient time has passed for submission if needed
- customer has not already reviewed the same qualifying experience

A review contains:
- overall rating
- optional structured sub-ratings
- written comment
- booking/experience reference
- language/locale
- timestamps
- moderation state

## Agency profile display

Show:
- average rating
- review count
- recent reviews
- rating distribution when useful
- verified/reviewed booking indicator where applicable
- agency response where provided

Do not display a rating when there is insufficient qualifying data; use a neutral "New"/"Not enough reviews" state instead of manufacturing a score.

## Agency responses

Agencies may respond to reviews through an authenticated management workflow.

Responses are public, timestamped, and subject to moderation/reporting rules.

## Moderation

Support:
- report review
- moderation queue
- hide/remove according to policy
- appeal/review action
- audit trail

Do not allow agency staff to silently alter customer-written review content.

## Anti-abuse controls

Consider:
- one review per qualifying experience
- rate limits
- duplicate-content signals
- suspicious burst detection
- account/booking linkage
- moderation flags

Do not automatically reject a review solely because an automated classifier is uncertain; use human review for ambiguous cases.

## Customer reputation

A private agency-side customer reliability signal can be designed separately from public agency ratings.

Potential future signals:
- completed rentals
- cancellations/no-shows
- payment behavior
- verified incidents

This must not become an unchecked public blacklist. Access, retention, disputes, and legal requirements require separate policy review.

## Public comments vs support messages

Marketplace comments/reviews are not support tickets.

Support conversations remain private and are stored under the support/ticket domain.

## Localization

Customer-written reviews can be displayed in their original language.

Do not silently rewrite or translate user content without indicating that a translation is machine-generated. Translation is a future enhancement.

## Trust signals beyond ratings

Agency profiles may also display factual badges such as:
- Verified business
- Verified location
- Verified fleet documents
- Response rate
- Cancellation reliability
- Established profile/date

Only show signals backed by authoritative platform data.

## Reference lessons

WordPress Car Rental System includes customer review/rating functionality.

Marketplace references such as Autorockin and Aggar demonstrate multi-party rental discovery patterns.

Our implementation keeps eligibility, moderation and trust signals under explicit backend policy.
