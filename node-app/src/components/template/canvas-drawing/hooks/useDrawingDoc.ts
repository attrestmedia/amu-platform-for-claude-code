"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DrawingDoc } from "../CanvasDrawingTypes";
import { useUndoRedo } from "./useUndoRedo";

export function useDrawingDoc(initial: DrawingDoc) {
  const history = useUndoRedo<DrawingDoc>(initial);

  const docRef = useRef(history.present);
  useEffect(() => {
    docRef.current = history.present;
  }, [history.present]);

  const api = useMemo(() => {
    const applyReplace = (next: DrawingDoc) => {
      docRef.current = next;
      history.replace(next);
      return next;
    };

    const applyPush = (next: DrawingDoc) => {
      docRef.current = next;
      history.push(next);
      return next;
    };

    return {
      ...history,
      docRef,
      applyReplace,
      applyPush,
    };
  }, [history]);

  return api;
}
