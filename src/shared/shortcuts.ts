// Every keyboard shortcut, in one place: the menu bar shows them and the
// Keyboard Shortcuts window lists them.

/** Commands the menu bar sends to the operator window. */
export type AppCommand =
  | 'new-song'
  | 'open'
  | 'import-documents'
  | 'open-playlist'
  | 'import-media'
  | 'save'
  | 'undo'
  | 'redo'
  | 'mode-show'
  | 'mode-edit'
  | 'next'
  | 'prev'
  | 'clear'
  | 'clear-media'
  | 'clear-all'
  | 'black'
  | 'logo'
  | 'themes'
  | 'bible'
  | 'ccli'
  | 'preferences'
  | 'remote'
  | 'shortcuts'
  | 'stream-look'
  | 'planning-center'
  | 'palette'
  | 'welcome'
  | `output:${string}`
  | `stage:${string}`;

export interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string[]; action: string }>;
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'During the show',
    items: [
      { keys: ['→', 'Space', 'Page Down'], action: 'Next slide (rolls into the next song in the service)' },
      { keys: ['←', 'Page Up'], action: 'Previous slide' },
      { keys: ['1 2 3…', 'Enter'], action: 'Go to that slide number' },
      { keys: ['C', 'V', 'B', 'P', 'T', 'I', 'E'], action: 'Jump to Chorus, Verse, Bridge, Pre-chorus, Tag, Intro, Ending (press again for the next one)' },
      { keys: ['Esc'], action: 'Clear the lyrics' },
      { keys: ['Shift', 'Esc'], action: 'Clear lyrics and background' },
      { keys: ['.'], action: 'Black out the screen (again to bring it back)' },
      { keys: ['L'], action: 'Show your logo (again to hide it), unless the song has a group on L' }
    ]
  },
  {
    title: 'Files and editing',
    items: [
      { keys: ['⌘/Ctrl', 'N'], action: 'New song' },
      { keys: ['⌘/Ctrl', 'O'], action: 'Open a presentation' },
      { keys: ['⌘/Ctrl', 'I'], action: 'Import PowerPoint, Word or text files' },
      { keys: ['⌘/Ctrl', 'B'], action: 'Bible: find and show verses' },
      { keys: ['⌘/Ctrl', ','], action: 'Preferences' },
      { keys: ['⌘/Ctrl', 'S'], action: 'Save' },
      { keys: ['⌘/Ctrl', 'Z'], action: 'Undo' },
      { keys: ['⇧⌘ Z', 'Ctrl Y'], action: 'Redo' },
      { keys: ['⌘/Ctrl', '1'], action: 'Show mode' },
      { keys: ['⌘/Ctrl', '2'], action: 'Edit mode' },
      { keys: ['⌥/Alt', 'Enter'], action: 'Split a slide at the cursor (Edit mode)' },
      { keys: ['⌘/Ctrl', 'Enter'], action: 'Finish editing a slide' }
    ]
  },
  {
    title: 'Anywhere',
    items: [
      { keys: ['Right-click'], action: 'More options on slides, groups, songs, playlists, media and the Live preview' },
      { keys: ['⌘/Ctrl', '/'], action: 'Show this list' }
    ]
  }
];
