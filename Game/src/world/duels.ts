// Duel asks between two figs. This module holds no sockets and no coins.
// A request is an offer from one fig to one named target. Only that target can answer it.
// An accepted offer becomes a pairing: two figs flagged as dueling each other.
// Nothing here settles a purse; the next plan owns damage, xp, and coin moves.

import type { FigWalk } from './core';

export interface PlumOffer {
  readonly fromId: string;
  readonly toId: string;
}

// Open offers plus accepted pairings. A pairing maps each fig to its partner, both ways.
export interface DuelOrchard {
  offers: PlumOffer[];
  readonly pairs: Map<string, string>;
}

export function plantDuelOrchard(): DuelOrchard {
  return { offers: [], pairs: new Map<string, string>() };
}

// A fig is standing in the room and out of town.
function inTheField(figs: ReadonlyMap<string, FigWalk>, figId: string): boolean {
  const fig = figs.get(figId);
  return fig !== undefined && fig.facts.place !== 'town';
}

/**
 * Ask a duel. The requester is the socket's fig; the target id is the only id on the message.
 * Refused (nothing changes) when either side is in town, the target is the requester,
 * the target is absent, or either side is already in a pairing.
 */
export function askDuel(
  duels: DuelOrchard,
  figs: ReadonlyMap<string, FigWalk>,
  requesterId: string,
  targetId: string,
): boolean {
  if (requesterId === targetId) {
    return false;
  }
  if (!inTheField(figs, requesterId) || !inTheField(figs, targetId)) {
    return false;
  }
  if (duels.pairs.has(requesterId) || duels.pairs.has(targetId)) {
    return false;
  }
  const already = duels.offers.some((offer) => offer.fromId === requesterId && offer.toId === targetId);
  if (!already) {
    duels.offers = [...duels.offers, { fromId: requesterId, toId: targetId }];
  }
  return true;
}

/**
 * The target answers the offer from fromId. Only the named target matches.
 * Accept pairs the two figs and drops every other offer that touches either one.
 * Decline drops just that offer. Returns whether an offer was answered.
 */
export function answerDuel(
  duels: DuelOrchard,
  figs: ReadonlyMap<string, FigWalk>,
  answererId: string,
  fromId: string,
  accept: boolean,
): boolean {
  const offer = duels.offers.find((row) => row.fromId === fromId && row.toId === answererId);
  if (offer === undefined) {
    return false;
  }
  if (!accept) {
    duels.offers = duels.offers.filter((row) => row !== offer);
    return true;
  }
  if (!inTheField(figs, fromId) || !inTheField(figs, answererId)) {
    dropDuelsFor(duels, fromId);
    return false;
  }
  duels.offers = duels.offers.filter(
    (row) => row.fromId !== fromId && row.toId !== fromId && row.fromId !== answererId && row.toId !== answererId,
  );
  duels.pairs.set(fromId, answererId);
  duels.pairs.set(answererId, fromId);
  return true;
}

// Drop every pending offer that touches this fig, and any pairing it is in.
export function dropDuelsFor(duels: DuelOrchard, figId: string): void {
  duels.offers = duels.offers.filter((row) => row.fromId !== figId && row.toId !== figId);
  const partner = duels.pairs.get(figId);
  if (partner !== undefined) {
    duels.pairs.delete(figId);
    duels.pairs.delete(partner);
  }
}

// Pending offers die when either side stands in town. An accepted pairing is left to the next plan.
export function sweepTownOffers(duels: DuelOrchard, figs: ReadonlyMap<string, FigWalk>): void {
  const kept = duels.offers.filter((row) => inTheField(figs, row.fromId) && inTheField(figs, row.toId));
  if (kept.length !== duels.offers.length) {
    duels.offers = kept;
  }
}

export function duelPartnerOf(duels: DuelOrchard, figId: string): string | null {
  return duels.pairs.get(figId) ?? null;
}
