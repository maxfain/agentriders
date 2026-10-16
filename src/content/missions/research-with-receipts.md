---
title: "Research with receipts"
seoTitle: "AI research agent: verify claims and sources"
description: "A 35–50 minute mission: give an AI agent a research contract, get a decision memo with a claim table, and inspect the evidence before acting on it."
summary: "Verify an AI agent's research before acting on it: the research contract requires a source URL, section and checked date for every material claim, and you open the sources yourself; a valid URL on an unsupported sentence fails review. This 35–50 minute mission ends with a decision memo, a claim table and a list of unresolved requirements."
published: 2026-09-29
updated: 2026-09-29
author: "Max Faingezicht"
audience: "Founders"
duration: "35–50 minutes"
art: "yard"
outcome: "A short decision memo, a verified claim table, and a list of unresolved requirements."
faq:
  - q: "How do I write a research contract for an AI agent?"
    a: "Paste the brief and links, then the contract. It tells the agent to investigate only the stated requirements, read original official sources rather than search snippets, and return for each material claim the source URL, relevant section, checked date, supporting paraphrase and any limitation. It labels statements as documented fact, inference or unresolved, and caps research at 20 minutes."
  - q: "How do I verify an AI research agent's claims against its sources?"
    a: "Open every source used for a decision-changing claim. Find the stated section. Check whether it supports the complete claim, including qualifying words such as \"all\", \"private\", \"automatic\" or \"free\". A valid URL attached to an unsupported sentence still fails review. If a source cannot be opened, mark the claim unverified and narrow the memo."
  - q: "What should a decision memo from an AI research agent include?"
    a: "A short memo, 350 words maximum in this mission, plus a claim table. It must address every confirmed need, separate repository visibility from website access, name the missing plan and configuration facts, and propose a bounded next step. It must not claim a deployment was tested. Different recommendations can pass if the evidence supports them."
---

## The mission

Ask an agent a narrow product question. Require it to show which source supports each material answer. Your job is to inspect the evidence before acting on the recommendation.

This exercise uses a fictional brief and public documentation. It does not require access to a company account, a paid plan, or a real domain. Reading pages is allowed. Creating a repository, changing DNS, buying a service, and publishing a website are outside scope.

Start with [Your first flight](/training/your-first-flight/) if you have not written an outcome and stop condition before. Download the [mission brief and acceptance checks](/training/kit/) to keep beside your draft.

## The founder brief: one narrow product decision for the AI agent

```text
Fictional project: Lantern, an open-source scheduling library.
Decision: is GitHub Pages a candidate for its public docs?

Confirmed needs:
- 20 pages of public HTML, CSS, and JavaScript.
- A custom subdomain the team controls.
- HTTPS for visitors.
- No checkout, user submissions, or customer data in this site.

Unresolved notes:
- A teammate asked whether the source repository can stay private.
- Someone wrote "maybe member-only docs later" in the roadmap.
- We have not specified an account plan or current DNS settings.

Deliverable: a maximum 350-word decision memo plus claim table.
No setup work is authorized. Recommend the next question to answer.
```

The distinction matters: public documentation today and restricted documentation later are different requirements. Do not let an agent combine them into one vague assurance that the platform “supports everything.”

## Start from primary sources, not search snippets

These official documents were checked for this exercise on September 29, 2026. Reopen them during your own run; product documentation can change.

| Source | What to inspect |
| --- | --- |
| [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) | Static hosting and availability by repository visibility and plan |
| [Custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages) | Supported domain types and configuration requirements |
| [HTTPS for GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https) | HTTPS support, correct configuration, and site visibility cautions |

The documentation describes static hosting, support for custom domains, and HTTPS for correctly configured sites. Those capabilities make this a reasonable candidate to investigate. They do not show that Lantern's account is eligible, its DNS is correct, or its future access requirements are satisfied. That distinction is the exercise.

## Give the AI agent a research contract

Paste the brief and links, followed by:

```text
Investigate only the stated GitHub Pages requirements.
Read the original official sources. Do not rely on search snippets.
For each material claim return:
claim | source URL | relevant section | checked date |
supporting paraphrase | limitation or unresolved dependency.

Label each memo statement as documented fact, inference,
or unresolved where that distinction affects the decision.
Do not treat a private source repository as proof of private
website access. Do not assume a plan or configuration.

If a page is unavailable or ambiguous, report that limit.
You may follow official links needed to clarify the question.
No account access, purchases, DNS edits, or publishing.
Time cap: 20 minutes of research, then return what is supported.
```

A tool without browsing can organize supplied text, but it cannot claim to have checked live documentation. In that case, open the sources yourself, provide the relevant passages, and have it label the memo “based on supplied excerpts.” Record when you retrieved them.

## Review the claim table: a valid URL is not a verified claim

Open every source used for a decision-changing claim. Find the stated section. Check whether it supports the complete claim, including qualifying words such as “all,” “private,” “automatic,” or “free.” A valid URL attached to an unsupported sentence still fails review.

Success means the memo addresses all three confirmed technical needs; distinguishes repository visibility from website access; identifies the missing plan and configuration facts; and proposes a bounded next step. It must not claim that a deployment was tested or that a setup is ready. No such work happened here.

Look for a recommendation like “candidate for a small public-docs trial after account and configuration review,” with its basis explained. Different recommendations can pass if the evidence supports them. A confident yes without the unresolved requirements cannot.

## What to do when sources conflict, fail to open, or the agent drifts

If sources conflict, preserve both statements and inspect their scope, product edition, and date. Do not average them. If a source cannot be opened, mark that claim unverified and narrow the memo. If future restricted access becomes essential, stop the original decision and create a separate research question with that requirement explicit.

If the agent drifts into a twenty-platform comparison, return to this brief. More options are not automatically more useful evidence.

## Keep a decision record

Save the prompt, fictional brief, claim table, memo, source URLs, and retrieval dates. Record which claims you checked and which you rejected. Keep short evidence notes in your own words; a source link alone will not preserve why a conclusion made sense at the time.

Use the [Flight Log template](/logs/template/) and mark this as practice. Record actual research and review time without inventing savings. [Evals](/manual/evals/) explains how to reuse these acceptance checks when your next research brief concerns a real product decision.
