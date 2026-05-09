/**
 * DrawingOptimizationUtils — Utilities for testing drawing throttling
 * and batch performance in development/testing environments.
 */

class DrawingOptimizationUtils {
  constructor() {
    this.metrics = new Map(); // roomId -> stats
  }

  /**
   * Initialize metrics for a room
   */
  initializeMetrics(roomId) {
    if (!this.metrics.has(roomId)) {
      this.metrics.set(roomId, {
        totalMovesReceived: 0,
        totalMovesEmitted: 0,
        totalBatches: 0,
        startTime: Date.now(),
        strokeMetrics: new Map(),
      });
    }
  }

  /**
   * Record incoming stroke_move event
   */
  recordIncomingMove(roomId, strokeId) {
    const stats = this.metrics.get(roomId) || this.initializeMetrics(roomId);
    stats.totalMovesReceived++;

    if (!stats.strokeMetrics.has(strokeId)) {
      stats.strokeMetrics.set(strokeId, {
        movesReceived: 0,
        movesEmitted: 0,
        batchesCreated: 0,
      });
    }
    stats.strokeMetrics.get(strokeId).movesReceived++;
  }

  /**
   * Record outgoing throttled stroke_move event
   */
  recordEmittedMove(roomId, strokeId) {
    const stats = this.metrics.get(roomId);
    if (!stats) return;

    stats.totalMovesEmitted++;
    stats.totalBatches++;

    const strokeStats = stats.strokeMetrics.get(strokeId);
    if (strokeStats) {
      strokeStats.movesEmitted++;
      strokeStats.batchesCreated++;
    }
  }

  /**
   * Calculate compression ratio for a room
   * Returns: {ratio, originalEvents, compressedEvents, savings}
   */
  getCompressionStats(roomId) {
    const stats = this.metrics.get(roomId);
    if (!stats || stats.totalMovesReceived === 0) {
      return {
        ratio: 1,
        originalEvents: 0,
        compressedEvents: 0,
        savings: "0%",
      };
    }

    const ratio = stats.totalMovesReceived / stats.totalMovesEmitted;
    const savingsPercent =
      ((stats.totalMovesReceived - stats.totalMovesEmitted) /
        stats.totalMovesReceived) *
      100;

    return {
      ratio: ratio.toFixed(2),
      originalEvents: stats.totalMovesReceived,
      compressedEvents: stats.totalMovesEmitted,
      savings: `${savingsPercent.toFixed(2)}%`,
      runtime: `${((Date.now() - stats.startTime) / 1000).toFixed(1)}s`,
    };
  }

  /**
   * Get detailed metrics for a room
   */
  getDetailedMetrics(roomId) {
    const stats = this.metrics.get(roomId);
    if (!stats) {
      return { error: "No metrics for room" };
    }

    const strokes = [];
    stats.strokeMetrics.forEach((strokeStats, strokeId) => {
      strokes.push({
        strokeId,
        movesReceived: strokeStats.movesReceived,
        movesEmitted: strokeStats.movesEmitted,
        compressionRatio: (
          strokeStats.movesReceived / strokeStats.movesEmitted
        ).toFixed(2),
      });
    });

    return {
      roomId,
      totalMovesReceived: stats.totalMovesReceived,
      totalMovesEmitted: stats.totalMovesEmitted,
      totalBatches: stats.totalBatches,
      compressionRatio: (
        stats.totalMovesReceived / stats.totalMovesEmitted
      ).toFixed(2),
      runtime: `${((Date.now() - stats.startTime) / 1000).toFixed(1)}s`,
      strokes,
    };
  }

  /**
   * Clear metrics for a room
   */
  clearMetrics(roomId) {
    this.metrics.delete(roomId);
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const all = {};
    this.metrics.forEach((stats, roomId) => {
      all[roomId] = this.getCompressionStats(roomId);
    });
    return all;
  }

  /**
   * Print human-readable summary
   */
  printSummary(roomId) {
    const stats = this.getDetailedMetrics(roomId);
    console.log("\n=== Drawing Optimization Metrics ===");
    console.log(`Room: ${stats.roomId}`);
    console.log(`Total Moves In: ${stats.totalMovesReceived}`);
    console.log(`Total Moves Out: ${stats.totalMovesEmitted}`);
    console.log(`Compression Ratio: ${stats.compressionRatio}x`);
    console.log(`Runtime: ${stats.runtime}`);
    console.log(`Strokes: ${stats.strokes.length}`);
    stats.strokes.forEach((stroke) => {
      console.log(
        `  - ${stroke.strokeId}: ${stroke.movesReceived} → ${stroke.movesEmitted} (${stroke.compressionRatio}x)`,
      );
    });
    console.log("=====================================\n");
  }
}

module.exports = new DrawingOptimizationUtils();
