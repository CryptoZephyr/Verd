# Verd documentation

Verd's public documentation is a navigable product guide. It takes a reader from understanding the facility to building, integrating, verifying, and troubleshooting it without requiring repository archaeology.

## Public information architecture

```text
/docs/start      Learn Verd in plain language
/docs/use        Follow lender and borrower journeys
/docs/concepts   Look up product concepts
/docs/build      Build the testnet implementation
/docs/integrate  Integrate the interface and worker
/docs/reference  Look up contracts, APIs, and addresses
/docs/evidence   Inspect current testnet records
/docs/security   Read trust and failure boundaries
/docs/help       Troubleshoot safely
```

The web interface exposes deep links for each page. The sidebar is grouped by reader intent rather than internal work history.

### Learn Verd

What Verd does, a facility in practice, how the preferred rate works, lender and borrower roles, the reserve boundary, and a product tour. These pages answer the financial questions before naming the technical components.

### Use Verd

Lender journey, borrower journey, facility states and next actions, and wallet and testnet guidance. These pages explain what each role can inspect or do without presenting a testnet record as a live offer.

### Product concepts

Facilities, Preferred Rate Condition, ReserveLocker, lifecycle, rate and interest, cross-chain proof, and trust boundaries.

### Build

Prerequisites, networks, facility creation, locker binding, reserve supply, qualification, draw, repayment, release, and authoritative readback.

### Integrate

Frontend integration, proof worker, job lifecycle, wallet and network handling, and evidence integration.

### Reference

Contract responsibilities, factory behavior, events, errors, backend API, deployments, and facility states.

### Evidence

Current deployment, cross-chain records, worker evidence, and the recorded lifecycle boundary.

### Security and help

Trust boundaries, secrets, proof validation, failure and replay behavior, troubleshooting, and FAQ.

## Content rules

- Plain-language product and role guidance come before protocol mechanics.
- The first reader question is answered directly: a lender sets a fixed-term facility, and a borrower can qualify for the preferred rate by locking the agreed WETH reserve until maturity.
- The preferred rate affects future interest only after Verd accepts the facility-specific reserve condition.
- The current reserve release is time-based and borrower-authorized. It does not receive an automatic Creditcoin repayment signal.
- Contract reads and external receipts are authoritative for current state.
- Worker metadata explains operations and recovery. It does not prove financial state.
- Tutorials explain sequence. Reference pages support lookup.
- Missing records are described as pending or unavailable.
- Deployment status, addresses, API routes, and security claims must be checked against the current source and environment before publication.
- Public pages use product concepts and evidence labels. Internal work history belongs in project records, not in the reader-facing navigation.

## Updating the docs

When a contract or backend route changes:

1. Update the relevant reference page.
2. Update the build or integration guide that teaches the sequence.
3. Update the evidence page if an address, transaction, or public deployment boundary changed.
4. Run `npm run build:web` and open at least one desktop and one mobile deep link.
5. Recheck every external claim against the relevant chain read, receipt, or service response.

The Notion architecture and frontend specification remain the design sources for the docs shell and information hierarchy. This repository contains the public implementation and current technical content.
