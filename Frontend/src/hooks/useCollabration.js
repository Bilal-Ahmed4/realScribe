// useCollaboration.js — Rewritten for Socket.IO
import { useEffect, useState, useRef } from "react";
import { useWebSocket } from "../context/useWebSocketContext";

// Get API URL with validation
const getApiUrl = () => {
  const url = import.meta.env.VITE_API_URL;
  if (!url || url === "undefined") {
    console.error("VITE_API_URL is not set. Current value:", url);
    return null;
  }
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    url.startsWith("http://")
  ) {
    return url.replace("http://", "https://");
  }
  return url;
};

export default function useCollaboration(roomId, me) {
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasJoinedRef = useRef(false);
  const cleanupRef = useRef(null);
  const messageIdsRef = useRef(new Set());

  if (!roomId || !me?.id || !me?.name) {
    console.error("roomId, me.id, and me.name are required");
  }

  const { connected, isReady, on, off, emit, connectWithUser } =
    useWebSocket();

  // Connect socket with user credentials
  useEffect(() => {
    if (me?.id && me?.name) {
      connectWithUser({ id: me.id, name: me.name });
    }
  }, [me.id, me.name, connectWithUser]);

  // Subscribe to presence and chat events
  useEffect(() => {
    if (!isReady) return;

    const presenceHandler = (data) => {
      try {
        console.log("Presence event:", data);
        if (data.type === "presence_join") {
          const updatedUsers = data.users.map((user) => ({
            ...user,
            type: "joining",
          }));
          setUsers(updatedUsers);
        } else if (data.type === "presence_leave") {
          setUsers((prevUsers) =>
            prevUsers.map((user) => {
              const stillPresent = data.users.some(
                (activeUser) => activeUser.id === user.id,
              );
              return stillPresent
                ? { ...user, type: "joining" }
                : { ...user, type: "leaving" };
            }),
          );
        } else if (data.type === "presence_sync") {
          const updatedUsers = data.users.map((user) => ({
            ...user,
            type: "joining",
          }));
          setUsers(updatedUsers);
        }
      } catch (error) {
        console.error("Error handling presence event:", error);
      }
    };

    const chatHandler = (data) => {
      try {
        console.log("Chat event:", data);
        if (data.type === "message_sent" || data.type === "system_message") {
          const newMessage = data.message;
          if (
            newMessage &&
            newMessage.id &&
            !messageIdsRef.current.has(newMessage.id)
          ) {
            messageIdsRef.current.add(newMessage.id);
            setMessages((prevMessages) => {
              const exists = prevMessages.some(
                (msg) => msg.id === newMessage.id,
              );
              if (!exists) {
                return [...prevMessages, newMessage];
              }
              return prevMessages;
            });
          } else {
            console.log("Duplicate message ignored:", newMessage?.id);
          }
        } else if (data.type === "message_history") {
          const newMessages = data.messages || [];
          messageIdsRef.current.clear();
          newMessages.forEach((msg) => {
            if (msg.id) messageIdsRef.current.add(msg.id);
          });
          setMessages(newMessages);
        }
      } catch (error) {
        console.error("Error handling chat event:", error);
      }
    };

    on("presence_update", presenceHandler);
    on("chat_event", chatHandler);

    return () => {
      off("presence_update", presenceHandler);
      off("chat_event", chatHandler);
    };
  }, [isReady, roomId, on, off]);

  // Load initial data via REST
  useEffect(() => {
    setIsLoading(true);
    messageIdsRef.current.clear();

    const loadData = async () => {
      const apiUrl = getApiUrl();

      if (!apiUrl || !roomId) {
        console.error("Cannot load collaboration data:", { apiUrl, roomId });
        setIsLoading(false);
        return;
      }

      const usersUrl = `${apiUrl}/api/rooms/${roomId}/users`;
      const messagesUrl = `${apiUrl}/api/rooms/${roomId}/messages?limit=100`;

      console.log("Fetching collaboration data from:", {
        usersUrl,
        messagesUrl,
      });

      try {
        const [usersResponse, messagesResponse] = await Promise.all([
          fetch(usersUrl),
          fetch(messagesUrl),
        ]);

        const usersData = usersResponse.ok ? await usersResponse.json() : [];
        console.log("tracking users: ", usersData);
        const messagesData = messagesResponse.ok
          ? await messagesResponse.json()
          : [];

        messagesData.forEach((msg) => {
          if (msg.id) messageIdsRef.current.add(msg.id);
        });

        setUsers(usersData);
        setMessages(messagesData);
      } catch (error) {
        console.error("Failed to load collaboration data:", error);
        setUsers([]);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [roomId]);

  // Join room via Socket.IO when ready
  useEffect(() => {
    if (isReady) {
      try {
        emit("join_room", {
          roomId,
          userId: me.id,
          name: me.name,
        });
        hasJoinedRef.current = true;
      } catch (error) {
        console.error("Failed to join room:", error);
      }
    }

    cleanupRef.current = () => {
      if (isReady && hasJoinedRef.current) {
        try {
          emit("leave_room", {
            roomId,
            userId: me.id,
            name: me.name,
          });
          hasJoinedRef.current = false;
        } catch (error) {
          console.error("Failed to leave room:", error);
        }
      }
    };

    return cleanupRef.current;
  }, [isReady, roomId, me.id, me.name, emit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      messageIdsRef.current.clear();
    };
  }, []);

  const sendMessage = (content) => {
    if (!isReady || !content.trim()) {
      console.warn("Cannot send message: not ready or empty content");
      return false;
    }

    try {
      emit("chat_send", {
        roomId,
        content: content.trim(),
      });
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  };

  return {
    users,
    messages,
    sendMessage,
    connected,
    isLoading,
    isReady,
  };
}
