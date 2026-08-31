/**
 * Composition root for the drills module: adapts the DB client and
 * scheduler every route already carries into the narrow readers/writers
 * each drill route's slice declared. Routes never see a Database or
 * Scheduler value directly. One builder per route, since the three
 * routes' needs differ (queue counts vs. the next exercise vs. grading
 * an answer).
 */
import {
  countDrillQueue,
  drillContextOf,
  getCard,
  getExerciseForUser,
  getNewExercise,
  getOrCreateCard,
  listDueExercises,
  recordResponse,
  saveCard,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type {
  CountDrillQueueDeps,
  GetNextDrillDeps,
  SubmitAnswerDeps,
} from "@velachess/drills";
import type { Scheduler } from "@velachess/scheduler";

export function buildCountDrillQueueDeps(db: Database): CountDrillQueueDeps {
  return {
    readDrillQueueCounts: (userId, now, scope) => countDrillQueue(db, userId, now, scope),
  };
}

export function buildGetNextDrillDeps(
  db: Database,
  scheduler: Scheduler,
): GetNextDrillDeps {
  return {
    listDueExercises: (userId, now, scope) => listDueExercises(db, userId, now, scope),
    getCard: (exerciseId) => getCard(db, exerciseId),
    drillContextOf: (exerciseId) => drillContextOf(db, exerciseId),
    getNewExercise: (userId, scope) => getNewExercise(db, userId, scope),
    previewIntervals: (card, now) => scheduler.previewIntervals(card, now),
    newCard: (now) => scheduler.newCard(now),
  };
}

export function buildSubmitAnswerDeps(
  db: Database,
  scheduler: Scheduler,
): SubmitAnswerDeps {
  return {
    getExerciseForUser: (userId, exerciseId) =>
      getExerciseForUser(db, userId, exerciseId),
    getOrCreateCard: (exerciseId, fresh) => getOrCreateCard(db, exerciseId, fresh),
    recordResponse: (exerciseId, response) => recordResponse(db, exerciseId, response),
    saveCard: (exerciseId, state) => saveCard(db, exerciseId, state),
    newCard: (now) => scheduler.newCard(now),
    reviewCard: (card, grade, now) => scheduler.review(card, grade, now),
  };
}
