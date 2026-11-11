import { createContext, useContext } from "react";

export type MediaUrlResolver = (src: string) => string | undefined;

export const WorkspaceMediaContext = createContext<MediaUrlResolver | undefined>(undefined);

export function useWorkspaceMediaResolver(): MediaUrlResolver | undefined {
  return useContext(WorkspaceMediaContext);
}
