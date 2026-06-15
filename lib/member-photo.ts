import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

function getPhotoDirectory() {
  const directory = new Directory(Paths.document, 'member-photos');
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

export function persistMemberPhoto(uri?: string) {
  if (!uri) return '';
  if (Platform.OS === 'web') return uri;
  const directory = getPhotoDirectory();
  if (uri.startsWith(directory.uri)) return uri;

  const extension = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1]?.toLowerCase() ?? 'jpg';
  const destination = new File(
    directory,
    `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`,
  );
  new File(uri).copy(destination);
  return destination.uri;
}
