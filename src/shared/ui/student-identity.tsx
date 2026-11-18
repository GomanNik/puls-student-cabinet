"use client";

import { createContext, useContext } from "react";

export const StudentIdentityContext = createContext("");

export function useStudentDisplayName() {
  return useContext(StudentIdentityContext);
}
