import React from "react";
import { parseLocalMediaFilename } from "@/services/mediaStore";
import { WorkspaceMediaContext, type MediaUrlResolver } from "./workspaceMediaContextValue";

export function WorkspaceMediaProvider({
  urlMap,
  children,
}: {
  urlMap: Record<string, string>;
  children: React.ReactNode;
}) {
  const resolveUrl = React.useCallback<MediaUrlResolver>(
    (src) => {
      if (!src) return undefined;
      if (urlMap[src]) return urlMap[src];
      const flat = parseLocalMediaFilename(src);
      if (flat && urlMap[flat]) return urlMap[flat];
      return undefined;
    },
    [urlMap],
  );

  return (
    <WorkspaceMediaContext.Provider value={resolveUrl}>
      {children}
    </WorkspaceMediaContext.Provider>
  );
}
