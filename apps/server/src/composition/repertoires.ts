/**
 * Composition root for the repertoires module: adapts the DB client every
 * route already carries into the narrow readers/writers each repertoires
 * route's slice declared. Routes never see a Database value directly.
 * One builder per route, since the seven routes' needs differ (list vs.
 * create vs. extract vs. detail vs. delete vs. add-chapter vs.
 * chapter-detail).
 */
import {
  addChapter as insertChapterRow,
  clearJudgments,
  countChaptersByRepertoire,
  countDrillQueue,
  countJudgmentsByChapter,
  countJudgmentsByType,
  countTrainingByChapter,
  createRepertoire as insertRepertoireRow,
  deleteRepertoire as removeRepertoireRow,
  findRepertoireOfColor,
  getChapterForUser,
  getJudgmentRows,
  getRepertoireWithChapters,
  listGamesForExtraction,
  listRepertoiresByUser,
  listUnmatchedGames,
  markRepertoireManual,
  renameRepertoire,
  replaceChapters,
  reopenNonPlayerJudgments,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import { seedRepertoireLines } from "@velachess/drills";
import type {
  AddChapterDeps,
  CreateRepertoireDeps,
  DeleteRepertoireDeps,
  ExtractRepertoireDeps,
  GetChapterDeps,
  GetRepertoireDeps,
  ListRepertoiresDeps,
} from "@velachess/repertoires";

export function buildListRepertoiresDeps(db: Database): ListRepertoiresDeps {
  return {
    listRepertoiresByUser: (userId) => listRepertoiresByUser(db, userId),
    getJudgmentRows: (repertoireId) => getJudgmentRows(db, repertoireId),
    countChaptersByRepertoire: (repertoireId) =>
      countChaptersByRepertoire(db, repertoireId),
    countJudgmentsByType: (repertoireId) => countJudgmentsByType(db, repertoireId),
    countDrillQueueForRepertoire: (userId, now, scope) =>
      countDrillQueue(db, userId, now, scope),
  };
}

export function buildCreateRepertoireDeps(db: Database): CreateRepertoireDeps {
  return {
    insertRepertoire: (input) => insertRepertoireRow(db, input),
  };
}

export function buildDeleteRepertoireDeps(db: Database): DeleteRepertoireDeps {
  return {
    removeRepertoire: (userId, repertoireId) =>
      removeRepertoireRow(db, userId, repertoireId),
  };
}

export function buildGetRepertoireDeps(db: Database): GetRepertoireDeps {
  return {
    getRepertoireWithChapters: (userId, repertoireId) =>
      getRepertoireWithChapters(db, userId, repertoireId),
    countJudgmentsByType: (repertoireId) => countJudgmentsByType(db, repertoireId),
    countJudgmentsByChapter: (repertoireId) => countJudgmentsByChapter(db, repertoireId),
    listUnmatchedGames: (repertoireId) => listUnmatchedGames(db, repertoireId),
    getJudgmentRows: (repertoireId) => getJudgmentRows(db, repertoireId),
    countTrainingByChapter: (userId, repertoireId) =>
      countTrainingByChapter(db, userId, repertoireId),
  };
}

export function buildGetChapterDeps(db: Database): GetChapterDeps {
  return {
    getChapterForUser: (userId, repertoireId, chapterId) =>
      getChapterForUser(db, userId, repertoireId, chapterId),
  };
}

export function buildAddChapterDeps(db: Database): AddChapterDeps {
  return {
    getRepertoireWithChapters: (userId, repertoireId) =>
      getRepertoireWithChapters(db, userId, repertoireId),
    insertChapter: (tx, data) => insertChapterRow(tx, data),
    markRepertoireManual: (tx, repertoireId) => markRepertoireManual(tx, repertoireId),
    reopenNonPlayerJudgments: (tx, repertoireId) =>
      reopenNonPlayerJudgments(tx, repertoireId),
    withTransaction: (fn) => db.transaction(fn),
    seedRepertoireLines: (userId, repertoireId) =>
      seedRepertoireLines(db, userId, repertoireId),
  };
}

export function buildExtractRepertoireDeps(db: Database): ExtractRepertoireDeps {
  return {
    listGamesForExtraction: (userId) => listGamesForExtraction(db, userId),
    findRepertoireOfColor: (userId, color) => findRepertoireOfColor(db, userId, color),
    insertRepertoire: (tx, data) => insertRepertoireRow(tx, data),
    renameRepertoire: (tx, repertoireId, name) =>
      renameRepertoire(tx, repertoireId, name),
    clearJudgments: (tx, repertoireId) => clearJudgments(tx, repertoireId),
    replaceChapters: (tx, repertoireId, chapters) =>
      replaceChapters(tx, repertoireId, chapters),
    withTransaction: (fn) => db.transaction(fn),
    seedRepertoireLines: (userId, repertoireId) =>
      seedRepertoireLines(db, userId, repertoireId),
  };
}
