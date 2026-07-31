export const DROP_MEMBER_PHONE_GUARDS_SQL = `
  DROP TRIGGER IF EXISTS prevent_duplicate_member_phone_insert;
  DROP TRIGGER IF EXISTS prevent_duplicate_member_phone_update;
`;

export const CREATE_MEMBER_PHONE_GUARDS_SQL = `
  CREATE TRIGGER IF NOT EXISTS prevent_duplicate_member_phone_insert
  BEFORE INSERT ON members
  WHEN EXISTS (SELECT 1 FROM members WHERE phone = NEW.phone)
  BEGIN
    SELECT RAISE(ABORT, 'A member with this phone number already exists.');
  END;

  CREATE TRIGGER IF NOT EXISTS prevent_duplicate_member_phone_update
  BEFORE UPDATE OF phone ON members
  WHEN NEW.phone != OLD.phone
    AND EXISTS (SELECT 1 FROM members WHERE phone = NEW.phone AND id != OLD.id)
  BEGIN
    SELECT RAISE(ABORT, 'A member with this phone number already exists.');
  END;
`;
