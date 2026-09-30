"use client";
import React from "react";
import ItemButton from "./item-button/ItemButton";
import { useUiControlStore } from "store/game";

const GameItemBox = React.memo(() => {
  const { showMap, toggleMap } = useUiControlStore();

  return (
    <div className="game-item-box flex items-center justify-end gap-2 px-2 fixed top-2 left-2 right-14 h-12 z-10">
      <ItemButton name="map" actived={showMap} onClick={toggleMap} className="transition-transform" />
    </div>
  );
});

GameItemBox.displayName = "GameItemBox";

export default GameItemBox;
