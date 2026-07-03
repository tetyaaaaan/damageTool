import type { CharacterBuild } from "../types/hsr";

type CharacterSelectorProps = {
  characters: CharacterBuild[];
  selectedId: string | null;
  onSelect: (character: CharacterBuild) => void;
};

export function CharacterSelector(_props: CharacterSelectorProps) {
  return null;
}