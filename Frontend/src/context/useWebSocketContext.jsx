import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { io } from "socket.io-client";

// Create the WebSocket Context
const WebSocketContext = createContext(null);

// Get Socket.IO server URL
const getSocketUrl = () => {
  const url = import.meta.env.VITE_API_URL;

  if (!url || url === "undefined") {
    console.error("VITE_API_URL is not set. Current value:", url);
    return null;
  }

  // Ensure URL uses HTTPS if we're on HTTPS
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    url.startsWith("http://")
  ) {
    console.warn("Converting HTTP to HTTPS for Socket URL");
    return url.replace("http://", "https://");
  }

  return url;
};

// WebSocket Provider Component
export function WebSocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const [user, setUser] = useState({ id: null, name: null });

  // Function to update user and trigger connection
  const connectWithUser = useCallback((userData) => {
    if (!userData.id || !userData.name) {
      console.error("User ID and name are required for socket connection");
      return;
    }
    setUser(userData);
  }, []);

  useEffect(() => {
    if (!user.id || !user.name) {
      return;
    }

    // Don't reconnect if already connected with same user
    if (socketRef.current?.connected) {
      console.log("Socket already connected, skipping reconnect");
      return;
    }

    const socketUrl = getSocketUrl();
    if (!socketUrl) {
      console.error(
        "Socket URL is not configured. Please set VITE_API_URL environment variable.",
      );
      return;
    }

    console.log("Connecting to Socket.IO:", socketUrl);

    const socket = io(socketUrl, {
      auth: {
        userId: user.id,
        name: user.name,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity,
    });

    socket.on("connect", () => {
      console.log("Connected to Socket.IO:", socket.id);
      setConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected from Socket.IO:", reason);
      setConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error.message);
      setConnected(false);
    });

    socketRef.current = socket;

    return () => {
      console.log("Cleaning up Socket.IO connection in Provider");
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [user.id, user.name]);

  // Emit an event
  const emit = useCallback((event, data) => {
    if (!socketRef.current?.connected) {
      console.error("Cannot emit: Socket not connected");
      return;
    }
    socketRef.current.emit(event, data);
  }, []);

  // Subscribe to an event
  const on = useCallback((event, handler) => {
    if (!socketRef.current) {
      console.warn(`Socket not ready; cannot subscribe to ${event}`);
      return;
    }
    socketRef.current.on(event, handler);
  }, []);

  // Unsubscribe from an event
  const off = useCallback((event, handler) => {
    if (!socketRef.current) return;
    if (handler) {
      socketRef.current.off(event, handler);
    } else {
      socketRef.current.off(event);
    }
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        connected,
        isReady: connected && socketRef.current?.connected,
        emit,
        on,
        off,
        connectWithUser,
        // Legacy-compatible aliases
        subscribe: on,
        unsubscribe: off,
        publish: emit,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

// Custom Hook for Child Components
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
