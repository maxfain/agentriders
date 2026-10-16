---
title: "How ranks are earned: Fledgling, Rider, Wingleader"
seoTitle: "AI agent track record: how ranks are earned"
description: "A public AI agent track record, never bought: Fledgling at 1 published flight, Rider at 20 flights and 2 Rider vouches, Wingleader by guild grant."
summary: "An AgentRiders rank is how a rider proves AI agent experience: a public track record, not a claim. Fledgling needs one published flight. Rider needs 20 published flights and 2 active vouches from riders who currently hold Rider or above. Wingleader requires running a wing, not yet supported, so the guild grants it by hand. Ranks are never sold."
published: 2026-10-16
updated: 2026-10-16
author: "Max Faingezicht"
sources: []
---

## What are the three AgentRiders ranks?

AgentRiders has three ranks, and the first two are computed from the public record by `src/lib/ranks.ts`.

| Rank | Published requirement | How it is reached today |
| --- | --- | --- |
| Fledgling | Joined · 1 flight logged | Automatic at 1 published flight |
| Rider | 20 flights · 2 Rider vouches | Automatic at 20 published flights plus 2 qualifying vouches, held at once |
| Wingleader | 100 flights · runs a wing · 5 vouches | Guild grant only; no wings yet |

The thresholds are two constants: `RIDER_FLIGHT_GATE = 20`, `RIDER_VOUCH_GATE = 2`. Below one flight you are unranked and your profile is unindexed. The same 20, counted Guild-wide, opens [the directory](/riders/directory/).

## What counts as a published flight?

A published flight is a flight log that passed human review and is live on the site under your handle.

Filed from [/logs/new/](/logs/new/) or by pull request with [the template](/logs/template/), approved by an admin, committed to git, listed in `/logs.json`. Drafts and queued submissions do not count. Outcome does not matter: an aborted flight with three burns counts as much as a landed one. Fields: [chapter 5](/manual/logging-a-flight/); definitions: [methodology](/data/methodology/).

As of 2026-10-16 the site holds one published flight, [Shipped AgentRiders Phase 2](/logs/shipped-agentriders-phase-2/) (5h, 3 burns, est. $550 on a subscription plan): one Fledgling by these rules, no Rider. n = 1; every number here is a rule, not a statistic.

## Which vouches count toward Rider rank?

Only an active vouch from a rider who currently holds Rider or Wingleader, and is not banned, counts toward the 2.

Rules (`src/lib/vouches.ts` and the schema):

| Rule | Enforced by |
| --- | --- |
| The voucher holds Rider or above at the time | API |
| No self-vouch | Database |
| One vouch per pair, ever | Database |
| A public statement, 1 to 500 characters, under the voucher's name | API |
| 5 vouches given per day, at most | Rate limit |
| A moderation-removed vouch cannot be remade | API |

"Currently" matters: the count uses each voucher's present rank, so a vouch from someone later banned stops counting the moment the ban lands.

## Do ranks ever go down?

Ranks only move up automatically; the only path down is moderation, and every change is written to an audit row.

| Trigger | Direction allowed |
| --- | --- |
| A publish or a qualifying vouch | Up |
| A voucher withdraws voluntarily | None; you keep the rank |
| Moderation removes a vouch | Recomputed, up or down |
| A voucher is banned or unbanned | Down on ban, up on unban, rippling to their vouchees |
| An admin grants or removes a rank | Set directly |

Voluntary revocation never demotes, so a vouch cannot be used as leverage. Each change writes a `rank_events` row (old rank, new rank, reason, actor); your profile's "earned" date comes from it.

## Why is Wingleader granted by hand?

Wingleader's published requirement includes "runs a wing", and wings (teams of riders) are not a feature yet, so the engine cannot compute it.

`computeRank` caps at Rider. Only an admin grant, recorded as `admin_grant` under the admin's handle, sets Wingleader; the engine never touches that rank afterward, up or down. The 100 flights and 5 vouches are the published standard; code does not check them today.

## Can a rank be bought?

No; there is no price on any rung, and the tiers on [the Guild page](/guild/) change what you can do, not what you are.

Two things share the word Rider: the rank, earned as above, and the planned $15/month membership tier, which is not enabled; during the founding season every rider flies free. A [verified flight](/riders/verified-flight/) badge and a profile's eval score are display-only; neither shortens the path.

## Questions riders ask

**How do I earn Rider rank on AgentRiders?**
Publish 20 flight logs under your handle and hold 2 active vouches from riders who are Rider or above, at the same time. The engine checks on every publish and vouch. Start at [/logs/new/](/logs/new/).

**Does a vouch from a Fledgling count?**
No. A Fledgling cannot vouch; the API refuses it. Only a rider who currently holds Rider or Wingleader and is not banned can vouch, and only those vouches count toward the 2.

**Can I lose my rank if someone withdraws their vouch?**
No. A voucher revoking their own vouch never demotes you. A rank goes down only when moderation removes a vouch or bans a voucher, and the change is recorded with a reason.
