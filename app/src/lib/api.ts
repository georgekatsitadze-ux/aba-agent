// src/lib/api.ts
import axios, { AxiosInstance } from "axios";

/**
 * Dev (vite dev): proxy "/api" -> http://localhost:3001
 * Preview/Build:   call API directly at http://localhost:3001/api
 */
const baseURL = import.meta.env.DEV ? "/api" : "http://localhost:3001/api";

const api: AxiosInstance = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

export default api;
