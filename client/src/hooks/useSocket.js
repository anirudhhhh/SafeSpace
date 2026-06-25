import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";

export function useSocket(token) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      console.log("No token, skipping socket connection");
      return;
    }

    console.log("Connecting to socket with token...");

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 5000,
    });

    socket.on("connect", () => {
      console.log("Socket connected!", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });

    socketRef.current = socket;

    return () => {
      console.log("Cleaning up socket");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const sendMessage = useCallback((message, sessionId, options = {}) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("send_message", { message, sessionId, ...options });
    } else {
      console.error("Socket not connected, cannot send");
    }
  }, []);

  const getSessions = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("get_sessions");
    }
  }, []);

  const loadSession = useCallback((sessionId) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("load_session", { sessionId });
    }
  }, []);

  const onMessage = useCallback(
    (callback) => {
      const socket = socketRef.current;
      if (socket) {
        socket.on("receive_message", callback);
        return () => socket.off("receive_message", callback);
      }
      return () => {};
    },
    [isConnected],
  );

  const onTyping = useCallback(
    (callback) => {
      const socket = socketRef.current;
      if (socket) {
        socket.on("typing", callback);
        return () => socket.off("typing", callback);
      }
      return () => {};
    },
    [isConnected],
  );

  const onSessionsList = useCallback(
    (callback) => {
      const socket = socketRef.current;
      if (socket) {
        socket.on("sessions_list", callback);
        return () => socket.off("sessions_list", callback);
      }
      return () => {};
    },
    [isConnected],
  );

  const onSessionLoaded = useCallback(
    (callback) => {
      const socket = socketRef.current;
      if (socket) {
        socket.on("session_loaded", callback);
        return () => socket.off("session_loaded", callback);
      }
      return () => {};
    },
    [isConnected],
  );

  const deleteSessionById = useCallback((sessionId) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("delete_session", { sessionId });
    }
  }, []);

  const onSessionDeleted = useCallback(
    (callback) => {
      const socket = socketRef.current;
      if (socket) {
        socket.on("session_deleted", callback);
        return () => socket.off("session_deleted", callback);
      }
      return () => {};
    },
    [isConnected],
  );

  return {
    sendMessage,
    getSessions,
    loadSession,
    deleteSessionById,
    onMessage,
    onTyping,
    onSessionsList,
    onSessionLoaded,
    onSessionDeleted,
    isConnected,
  };
}
