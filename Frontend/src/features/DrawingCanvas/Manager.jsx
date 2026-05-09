import { useRef, useEffect, useCallback } from "react";
import { useDrawingState } from "./hooks/useDrawingState";
import { useCanvasRenderer } from "./hooks/useCanvasRenderer";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { useEraser } from "./hooks/useEraser";
import { useInfiniteCanvas } from "./hooks/useInfiniteCanvas";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import CanvasDraw from "./CanvasDraw";
import DrawOptions from "../../components/DrawOptions";
import SimpleEditor from "../TextEditor/components/tiptap-templates/simple/simple-editor";
import { useWebSocket } from "../../context/useWebSocketContext";

export default function Manager({
  isDarkMode,
  roomId,
  id: userId,
  mode,
  name,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef();
  const ctxRef = useRef(null);
  const isMounted = useRef(false);
  const isDownPressed = useRef(false);
  const penWidth = useRef(2);
  const colorRef = useRef(isDarkMode ? "#ffffff" : "#000000");
  const currentToolRef = useRef("pen");
  const pointBuffer = useRef([]); // Buffer for batching network updates
  const completedStrokeIdsRef = useRef(new Set()); // Track completed stroke IDs to prevent race conditions

  const { isReady, on, off, emit } = useWebSocket();

  // Initialize drawing state management
  const {
    isDrawing,
    myStroke,
    liveStrokes,
    completedStrokes,
    currentStrokeId,
    addCompletedStroke,
    clearLocalStroke,
    startNewStroke,
    addPointToStroke,
  } = useDrawingState();

  // Initialize eraser functionality
  const {
    // isErasing,
    startErasing,
    continueErasing,
    stopErasing,
    // getErasedStrokes,
  } = useEraser(completedStrokes, isDrawing);

  // Initialize infinite canvas
  const {
    viewportRef,
    transformRef,
    isPanning,
    startPan,
    continuePan,
    stopPan,
    zoomIn,
    zoomOut,
    resetView,
    getCanvasPoint,
  } = useInfiniteCanvas(canvasRef);

  // Initialize canvas renderer
  const { scheduleRedraw, drawGrid } = useCanvasRenderer(
    ctxRef,
    canvasRef,
    isDarkMode,
    penWidth,
    colorRef,
    {
      completedStrokes,
      liveStrokes,
      myStroke,
      isDrawing,
      currentTool: currentToolRef.current,
      viewportRef,
      transformRef,
    },
  );

  // Initialize undo/redo system
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    addToHistory,
    //  clearHistory
  } = useUndoRedo(completedStrokes, scheduleRedraw);

  // Handle incoming drawing events from Socket.IO
  // Socket.IO broadcasts to others only (socket.to(room).emit), so
  // we no longer need to filter out our own userId for drawing events
  const onDrawingEvent = useCallback(
    (data) => {
      if (!isMounted.current) return;

      switch (data.type) {
        case "stroke_move":
          try {
            const {
              payload,
              userId: userWhoDraw,
              strokeId: incomingStrokeId,
            } = data;

            // Handle both single point (legacy) and batched points
            const pointsToProcess =
              payload.points ||
              (payload.x ? [[payload.x, payload.y, payload.pressure]] : []);

            // RACE CONDITION FIX: Ignore stroke_move for strokes that have already been completed
            if (completedStrokeIdsRef.current.has(incomingStrokeId)) {
              console.log(
                "Ignoring late stroke_move for completed stroke:",
                incomingStrokeId,
              );
              return;
            }

            if (!liveStrokes.current.has(incomingStrokeId)) {
              liveStrokes.current.set(incomingStrokeId, {
                points: [],
                userId: userWhoDraw,
                tool: payload.tool || "pen",
                width: payload.width || 2,
                color: payload.color,
                lastUpdate: performance.now(),
              });
            }

            const strokeData = liveStrokes.current.get(incomingStrokeId);

            pointsToProcess.forEach((point) => {
              strokeData.points.push(point);
            });

            strokeData.lastUpdate = performance.now();
            scheduleRedraw();
          } catch (error) {
            console.error("Error parsing draw message:", error);
          }
          break;

        case "stroke_end":
          try {
            const {
              payload,
              userId: userWhoDraw,
              strokeId: completedStrokeId,
            } = data;

            const { currentStrokes, tool, width, color } = payload;

            // Mark this stroke as completed
            completedStrokeIdsRef.current.add(completedStrokeId);

            // Clean up old completed IDs to prevent memory leak
            if (completedStrokeIdsRef.current.size > 100) {
              const idsArray = Array.from(completedStrokeIdsRef.current);
              completedStrokeIdsRef.current = new Set(idsArray.slice(-50));
            }

            if (liveStrokes.current.has(completedStrokeId)) {
              liveStrokes.current.delete(completedStrokeId);
            }

            if (currentStrokes && currentStrokes.length > 0) {
              const strokeWithMetadata = {
                points: currentStrokes,
                tool: tool || "pen",
                id: completedStrokeId,
                userId: userWhoDraw,
                width: width || 2,
                color: color || (isDarkMode ? "#ffffff" : "#000000"),
              };
              addCompletedStroke(strokeWithMetadata);
              addToHistory();
            }

            scheduleRedraw();
          } catch (error) {
            console.error("Error parsing stop message:", error);
          }
          break;

        case "clear":
          try {
            const { payload } = data;
            const { erasedStrokes } = payload;

            if (erasedStrokes.length > 0) {
              erasedStrokes.forEach((strokeId) => {
                completedStrokes.current = completedStrokes.current.filter(
                  (s) => s.id !== strokeId,
                );
              });
              addToHistory();
            }
            scheduleRedraw();
          } catch (error) {
            console.error("Error parsing erase message:", error);
          }
          break;

        default:
          break;
      }
    },
    [
      scheduleRedraw,
      liveStrokes,
      isDarkMode,
      addCompletedStroke,
      addToHistory,
      completedStrokes,
    ],
  );

  // Subscribe to drawing events via Socket.IO
  useEffect(() => {
    if (!isReady) return;

    on("drawing_event", onDrawingEvent);

    return () => {
      off("drawing_event", onDrawingEvent);
    };
  }, [isReady, roomId, on, off, onDrawingEvent]);

  const getApiUrl = () => {
    const url = import.meta.env.VITE_API_URL;
    if (!url || url === "undefined") {
      return null;
    }
    if (window.location.protocol === "https:" && url.startsWith("http://")) {
      return url.replace("http://", "https://");
    }
    return url;
  };

  // Set mounted flag and fetch initial data from backend
  useEffect(() => {
    isMounted.current = true;

    async function fetchStrokes() {
      const apiUrl = getApiUrl();
      if (!apiUrl) {
        console.error("Cannot fetch strokes: API URL is not configured");
        return;
      }

      const drawUrl = `${apiUrl}/api/draw/${roomId}`;
      console.log("Fetching strokes from:", drawUrl);
      const response = await fetch(drawUrl);

      if (!response.ok) {
        console.warn(
          `Failed to fetch strokes (Status: ${response.status}). Backend might not be deployed or room is empty.`,
        );
        return;
      }

      const result = await response.json();

      for (const fetchedObject of result) {
        const points = fetchedObject.payload.currentStrokes;
        const strokeWithMetadata = {
          id: fetchedObject.id,
          ...fetchedObject.payload,
          points,
        };
        addCompletedStroke(strokeWithMetadata);
        if (points) addToHistory();
        scheduleRedraw();
      }
    }

    fetchStrokes();

    return () => {
      isMounted.current = false;
    };
  }, [scheduleRedraw, addCompletedStroke, addToHistory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctxRef.current = ctx;

    const dpr = window.devicePixelRatio || 1;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      scheduleRedraw();
    };

    // Initial draw
    resizeCanvas();

    // Observe container changes
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas.parentElement);

    return () => {
      observer.disconnect();
    };
  }, [scheduleRedraw, drawGrid, addCompletedStroke, addToHistory]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    canUndo,
    publish: emit,
    isReady,
    containerRef,
    onRedo: () => {
      if (canRedo) {
        redo();
        scheduleRedraw();
      }
    },
    currentToolRef,
    onResetView: resetView,
    isPanning,
    isDownPressed,
  });

  const handlePointerDown = useCallback(
    (e) => {
      if (e.button === 2) return;
      containerRef?.current?.focus();

      if (!isReady) return;
      isDownPressed.current = true;
      e.preventDefault();

      // Check if space is held for panning
      if (isPanning.current) {
        startPan(e);
        return;
      }

      const point = getCanvasPoint(e);

      if (currentToolRef.current === "eraser") {
        const erasedStrokes = startErasing(point);
        scheduleRedraw();

        if (erasedStrokes.length > 0) {
          emit("clear", {
            type: "clear",
            roomId,
            userId,
            payload: {
              erasedStrokes,
            },
          });
        }
      } else {
        // Clear point buffer when starting a new stroke
        pointBuffer.current = [];

        const newStrokeId = startNewStroke(point);
        scheduleRedraw();

        emit("stroke_move", {
          type: "stroke_move",
          roomId,
          userId,
          strokeId: newStrokeId,
          payload: {
            x: point[0],
            y: point[1],
            pressure: point[2],
            tool: currentToolRef.current,
            width: penWidth.current,
            color: colorRef.current,
          },
        });
      }
    },
    [
      isReady,
      emit,
      getCanvasPoint,
      currentToolRef,
      startPan,
      startErasing,
      startNewStroke,
      scheduleRedraw,
      isPanning,
      penWidth,
      colorRef,
      roomId,
      userId,
    ],
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isReady) return;

      if (!isDownPressed.current) return;

      e.preventDefault();

      const point = getCanvasPoint(e);

      if (isPanning.current) {
        continuePan(e);
        scheduleRedraw();
        return;
      }

      if (currentToolRef.current === "eraser") {
        const erasedStrokes = continueErasing(point);
        scheduleRedraw();

        if (erasedStrokes.length > 0) {
          emit("clear", {
            type: "clear",
            roomId,
            userId,
            payload: {
              erasedStrokes,
            },
          });
        }
      } else {
        if (!isDrawing.current) return;

        if (addPointToStroke(point)) scheduleRedraw();

        // Batch points for network efficiency
        if (!pointBuffer.current) pointBuffer.current = [];
        pointBuffer.current.push([point[0], point[1], point[2]]);

        const now = performance.now();

        // Flush buffer every 30ms
        if (now - lastEventTime.current >= 30) {
          if (pointBuffer.current.length > 0) {
            lastEventTime.current = now;

            emit("stroke_move", {
              type: "stroke_move",
              roomId,
              userId,
              strokeId: currentStrokeId.current,
              payload: {
                points: pointBuffer.current,
                tool: currentToolRef.current,
                width: penWidth.current,
                color: colorRef.current,
              },
            });

            pointBuffer.current = [];
          }
        }
      }
    },
    [
      isReady,
      emit,
      getCanvasPoint,
      isPanning,
      continuePan,
      isDrawing,
      currentToolRef,
      continueErasing,
      addPointToStroke,
      scheduleRedraw,
      currentStrokeId,
      penWidth,
      colorRef,
      roomId,
      userId,
    ],
  );

  const handlePointerUp = useCallback(() => {
    isDownPressed.current = false;

    if (isPanning.current) {
      stopPan();
      return;
    }

    if (currentToolRef.current === "eraser") {
      stopErasing();
      scheduleRedraw();
      return;
    }

    if (!isDrawing.current || !isReady) return;

    const strokeData = clearLocalStroke();
    if (strokeData.points.length > 0) {
      const strokeWithMetadata = {
        points: strokeData.points,
        tool: currentToolRef.current,
        userId,
        id: strokeData.id,
        width: penWidth.current,
        color: colorRef.current,
      };

      addCompletedStroke(strokeWithMetadata);
      addToHistory();

      emit("stroke_end", {
        type: "stroke_end",
        roomId,
        userId,
        strokeId: strokeData.id,
        payload: {
          currentStrokes: strokeData.points,
          tool: currentToolRef.current,
          width: penWidth.current,
          color: colorRef.current,
        },
      });

      pointBuffer.current = [];
    }

    scheduleRedraw();
  }, [
    isPanning,
    stopPan,
    isDrawing,
    isReady,
    emit,
    currentToolRef,
    stopErasing,
    clearLocalStroke,
    addCompletedStroke,
    addToHistory,
    scheduleRedraw,
    penWidth,
    colorRef,
    roomId,
    userId,
  ]);

  const lastEventTime = useRef(0);
  return (
    <div className="flex flex-3">
      <div
        className={`${mode === "text" ? "block" : "hidden"} flex-3 overflow-auto`}
      >
        <div className={`simple-editor-wrapper`}>
          <SimpleEditor roomId={roomId} userId={userId} name={name} />
        </div>
      </div>
      <div
        className={`relative flex-3 ${mode === "canvas" ? "block" : "hidden"}`}
      >
        <DrawOptions
          isDarkMode={isDarkMode}
          currentToolRef={currentToolRef}
          penWidth={penWidth}
          colorRef={colorRef}
          scheduleRedraw={scheduleRedraw}
          canvasRef={canvasRef}
        />
        <CanvasDraw
          isPanning={isPanning}
          currentToolRef={currentToolRef}
          canvasRef={canvasRef}
          handlePointerDown={handlePointerDown}
          handlePointerMove={handlePointerMove}
          handlePointerUp={handlePointerUp}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          scheduleRedraw={scheduleRedraw}
          getCanvasPoint={getCanvasPoint}
          isDownPressed={isDownPressed}
          ref={containerRef}
        />
      </div>
    </div>
  );
}
