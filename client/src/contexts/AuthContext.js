import React, { createContext, useState, useContext, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001/api";
const authApi = axios.create();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await authApi.get(`${API_URL}/auth/profile`);
      const fetchedUser = res.data.user || res.data;
      setUser({ ...fetchedUser, id: fetchedUser._id || fetchedUser.id });
    } catch (err) {
      console.error("[auth] profile fetch failed:", err.message);
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initToken = localStorage.getItem("token");
    if (initToken) {
      authApi.defaults.headers.common["Authorization"] = `Bearer ${initToken}`;
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authApi.post(`${API_URL}/auth/login`, {
      email,
      password,
    });

    const { token, user: loggedInUser } = res.data;
    authApi.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    localStorage.setItem("token", token);
    setToken(token);
    setUser({ ...loggedInUser, id: loggedInUser._id || loggedInUser.id });

    return res.data;
  };

  const register = async (email, password, displayName, whatBringsYou) => {
    const res = await authApi.post(`${API_URL}/auth/register`, {
      email,
      password,
      displayName,
      whatBringsYou,
    });

    const { token, user: registeredUser } = res.data;
    authApi.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    localStorage.setItem("token", token);
    setToken(token);
    setUser({ ...registeredUser, id: registeredUser._id || registeredUser.id });

    return res.data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    delete authApi.defaults.headers.common["Authorization"];
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
