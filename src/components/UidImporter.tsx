import type { CharacterBuild } from "../types/hsr";

type UidImporterProps = {
  isLoading: boolean;
  message: string;
  onSearch: (uid: string) => void;
};

export function UidImporter(_props: UidImporterProps) {
  return null;
}

export type UidImporterCharacterResult = {
  characters: CharacterBuild[];
};