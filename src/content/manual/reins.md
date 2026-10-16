---
title: "Reins: permissions that are tight enough to be loosened"
seoTitle: "AI agent permissions: data vs instructions"
chapter: 2
description: "AI agent permissions, enforced rather than instructed: least privilege, approval before the side effect, retrieved data treated as data, not instructions."
summary: "AI agent permissions (what riders call the reins) must be enforced by the harness, not only stated in the prompt. Start from least privilege, write the permission map down per workflow, put a concrete approval before each side effect, and treat retrieved documents and tool output as data, not instructions. Loosen one boundary at a time, on evidence."
published: 2026-09-26
updated: 2026-10-16
author: "Max Faingezicht"
draft: false
faq:
  - q: "What permissions should I give an AI agent?"
    a: "Start with the least access that makes the task possible, reads included. Map each surface: files (approved project and output directories), network (destinations the task requires), business systems (a test account or selected records), and execution (bounded jobs and known tools). Check boundaries, inherited credentials, egress, connector scope and spending controls before the run."
  - q: "When should an AI agent ask for approval?"
    a: "Before the side effect, not after, with the actual action in view: destination, exact content or diff, affected records and expected consequence. 'May I continue?' is usually too vague to assess. Prepare the work, then present the concrete action; if the approved payload changes materially, review it again. Do not ask again for harmless steps the assignment already covers."
  - q: "Should an AI agent follow instructions found in a document?"
    a: "No. Treat retrieved pages, documents and tool output as task data, not new authority. A document telling an agent to upload secrets has not expanded its mandate. Do not rely on instructions alone: limit what the agent can read and where it can send information, even when it is told to ignore such requests."
---

## Instructions are not enforcement

Reins describe what an agent may do. The harness must make those limits real.

“Draft the email; do not send it” is a useful instruction. A tool connection with draft-only access is a stronger boundary. If the connection can send, the workflow needs an enforced approval before that action. Do not assume the prose in a prompt changes the permissions of the account underneath it.

Write down both layers: the behavior you requested and the control that limits execution. Where there is no enforced control, say so. That is a supervision requirement, not a detail to hide.

## Build a least-privilege permission map

Start with the least access that makes the task possible. Inspect reads as well as writes: reading a private document and passing its contents to another service can be consequential even if the source remains unchanged.

| Surface | Narrow starting point | Check before the flight |
| --- | --- | --- |
| Files | Approved project and output directories | Read and write boundaries, inherited credentials |
| Network | Destinations required for the task | Egress restrictions and connected services |
| Business systems | Test account or selected records | Account role, connector scope, approval gate |
| Execution | Bounded jobs and known tools | Cancellation, timeouts, retries, spending controls |

A Git branch or worktree separates changes for review. Neither is, by itself, a security boundary. Code running there can still have the filesystem, network, and account access of its process.

For technical background, Anthropic describes [filesystem and network isolation](https://www.anthropic.com/engineering/claude-code-sandboxing) as separate parts of sandboxing. Inspect your own tool's current configuration; a feature name does not tell you which boundaries are enabled.

## Write a reusable permission policy (the bridle)

A bridle is the permission map made concrete for one workflow. Store it beside the task instructions and version it when access changes.

```text
Workflow: weekly pipeline review
Read: the approved, sanitized CRM export
Write: a new review document in the staging folder
External actions: none
Human decision: approve any proposed CRM changes
Limits: one export, one draft, one revision
Stop: missing definitions, conflicting records, new access needed
Evidence: source row identifiers and a list of unresolved questions
```

This is an illustrative policy, not executable configuration. Translate it into the controls your environment supports. If your connector cannot restrict access to the intended records, use an approved export or a narrower account instead of pretending the instruction provides isolation.

The [harness lesson](/training/build-the-harness/) helps you record this distinction. Copy the working form from the [training kit](/training/kit/).

## Put approval before the side effect

An approval should identify the actual action: destination, exact content or diff, affected records, and expected consequence. “May I continue?” is usually too vague to assess.

Prepare the work first, then present the concrete action for approval. If the approved payload changes materially, review the changed payload. Do not ask for repeated approval for harmless steps already covered by the assignment.

When access is denied, stop at that boundary. Report what was blocked and what narrower alternative would still complete the task. Do not ask the agent to invent a new instruction, edit a policy, or switch credentials to evade the denial.

OpenAI's [guardrails and human review documentation](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) distinguishes automatic validation from approval decisions. Both need to sit at the right execution point. A check after an email is sent cannot make that send conditional.

## Test the permissions before you loosen them

Use harmless fixtures in a test environment to confirm that an allowed action works and an out-of-scope action is refused. Check cancellation without touching production data. Verify that a retry does not bypass approval.

Treat retrieved pages, documents, and tool output as task data, not new authority. A document telling an agent to upload secrets has not expanded its mandate. Limit what can be read and where information can be sent even when the agent has instructions to ignore such requests.

Review the bridle when tools, accounts, models, or tasks change. Loosen one meaningful boundary at a time, supported by the evidence described in [the bond](/manual/agent-trust-and-autonomy/).
