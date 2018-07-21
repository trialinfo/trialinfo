/*
 * Remove all personal rider data not used on the results pages from all events
 * which are only in series which are no longer "open".
 */

UPDATE riders
SET
  street = NULL,
  city = NULL,
  zip = NULL,
  date_of_birth = NULL,
  phone = NULL,
  emergency_phone = NULL,
  license = NULL,
  email = NULL,
  comment = NULL,
  rider_comment = NULL,
  insurance = NULL,
  version = version + 1
WHERE id NOT IN (
    SELECT DISTINCT id
    FROM series_events JOIN series USING (serie)
    WHERE NOT COALESCE(closed, 0)
  UNION
    SELECT id
    FROM events WHERE id NOT IN (
      SELECT id FROM series_events
    )
)
