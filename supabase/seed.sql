-- =====================================================================
-- Starter sports so the site isn't empty on day one. Run once, after
-- schema.sql. Everything here is a placeholder the ADs can edit or
-- delete from the Admin page — coaches, divisions and practice times
-- especially. Re-running skips sports that already exist.
-- =====================================================================

insert into public.sports (slug, name, season, tier, divisions, emoji, color, summary, body, practice_info, how_to_join, sort_order)
values
  ('soccer', 'Soccer', 'fall', 'team', 'Varsity Boys · Varsity Girls', '⚽', '#16A34A',
   'Eleven a side, ninety minutes, and the loudest sideline on campus.',
   E'Our fall flagship. The team trains for league fixtures and the end-of-season tournament.\n\nAll skill levels are welcome at tryouts — coaches look for effort and teamwork as much as touch.',
   'Mon · Wed · Fri after school', 'Come to tryouts in the first weeks of the semester. Bring boots, shin guards and water.', 10),

  ('volleyball', 'Volleyball', 'fall', 'team', 'Varsity Girls · Varsity Boys', '🏐', '#F59E0B',
   'Fast rallies, big blocks, bigger team spirit.',
   'Six players, three touches, one net. Volleyball rewards communication more than any other sport we play.',
   'Tue · Thu after school', 'Watch the calendar for the tryout date and sign up before the deadline.', 20),

  ('cross-country', 'Cross Country', 'fall', 'team', 'Coed', '🏃', '#0EA5E9',
   'Distance running over hills, grass and trail.',
   'An individual sport scored as a team. Every finisher counts, so every runner matters.',
   'Mornings before school', 'No experience needed — just the willingness to keep going.', 30),

  ('basketball', 'Basketball', 'winter', 'team', 'Varsity Boys · Varsity Girls · MS', '🏀', '#EA580C',
   'The winter season''s main event in the gym.',
   'Our biggest winter program with varsity and middle school squads.',
   'Mon – Thu after school', 'Tryouts open at the start of the winter season.', 40),

  ('badminton', 'Badminton', 'winter', 'team', 'Coed', '🏸', '#8B5CF6',
   'Singles, doubles and mixed — the fastest racquet sport there is.',
   'Players compete in singles, doubles and mixed doubles brackets.',
   'Tue · Thu after school', 'Sign up through the calendar when the season opens.', 50),

  ('track-and-field', 'Track & Field', 'spring', 'team', 'Coed', '🥇', '#DC2626',
   'Sprints, distance, jumps and throws.',
   'Something for everyone: sprinters, distance runners, jumpers and throwers all score for the same team.',
   'Mon · Wed · Fri after school', 'Come to the first meeting of the spring season.', 60),

  ('table-tennis', 'Table Tennis', 'spring', 'team', 'Coed', '🏓', '#0D9488',
   'Reflexes, spin, and very quick feet.',
   'Singles and doubles play against other schools in the spring.',
   'Tue · Thu after school', 'Sign up through the calendar when the season opens.', 70),

  ('indoor-rowing', 'Indoor Rowing', 'winter', 'opportunity', 'Individual · Relay', '🚣', '#2563EB',
   'Race on a rowing machine against schools you''ll never meet in person.',
   E'Indoor rowing is raced on ergometers ("ergs") — the rowing machines found in most gyms. Races are over a set distance, most often **2,000 m**, or a set time, and results are compared on the machine''s monitor, which is why schools can compete in virtual events without traveling.\n\n### Why try it\n- No boat, water or prior experience needed\n- A full-body workout that builds fitness for every other sport\n- Individual and relay events, so you can race solo or as a team\n\n### Technique in one line\nLegs, then body, then arms on the drive; arms, then body, then legs on the way back.',
   'Watch Notices for training sessions', 'Tell a StuCo AD you''re interested — we''ll post events as the school enters them.', 110),

  ('climbing', 'Sport Climbing', 'year', 'opportunity', 'Individual', '🧗', '#A16207',
   'Bouldering and top-rope climbing at local gyms.',
   'Climbing is problem-solving you do with your whole body. Opportunities depend on nearby gyms and competitions.',
   null, 'Follow the sport to hear about sessions and competitions.', 120),

  ('esports', 'Esports', 'year', 'opportunity', 'Coed', '🎮', '#DB2777',
   'Organized team gaming in school-approved titles.',
   'Where interest and supervision allow, the school may enter organized esports leagues.',
   null, 'Follow the sport to hear about tryouts.', 130)
on conflict (slug) do nothing;
