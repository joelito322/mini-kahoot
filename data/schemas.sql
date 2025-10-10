-- Crear tablas para MiniKahoot Contact Center

-- Tipos enumerados
CREATE TYPE profile_role AS ENUM ('agent', 'supervisor');
CREATE TYPE session_status AS ENUM ('lobby', 'running', 'paused', 'ended');

-- Tabla profiles
CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text NOT NULL,
  role profile_role NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Tabla quizzes
CREATE TABLE quizzes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  archived bool DEFAULT false
);

-- Tabla questions
CREATE TABLE questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  text text NOT NULL,
  order_index int NOT NULL,
  time_limit_sec int DEFAULT 20,
  created_at timestamptz DEFAULT now()
);

-- Tabla options
CREATE TABLE options (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  text text NOT NULL,
  is_correct bool NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Tabla sessions
CREATE TABLE sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid REFERENCES quizzes(id) ON DELETE SET NULL NOT NULL,
  code text UNIQUE NOT NULL,
  status session_status DEFAULT 'lobby',
  current_question_id uuid REFERENCES questions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Tabla session_participants
CREATE TABLE session_participants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  alias text NOT NULL,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(session_id, alias)
);

-- Tabla answers
CREATE TABLE answers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  participant_id uuid REFERENCES session_participants(id) ON DELETE CASCADE NOT NULL,
  option_id uuid REFERENCES options(id) ON DELETE CASCADE NOT NULL,
  answered_at timestamptz DEFAULT now(),
  time_ms int NOT NULL,
  UNIQUE(question_id, participant_id)
);

-- Tabla scores
CREATE TABLE scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  participant_id uuid REFERENCES session_participants(id) ON DELETE CASCADE NOT NULL,
  score int DEFAULT 0,
  last_update timestamptz DEFAULT now()
);

-- Tabla events (opcional)
CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- Políticas RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can select their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can select quizzes created by them" ON quizzes FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can insert their own quizzes" ON quizzes FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own quizzes" ON quizzes FOR UPDATE USING (auth.uid() = created_by);

-- ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage questions of their quizzes" ON questions FOR ALL USING (
  auth.uid() IN (SELECT created_by FROM quizzes WHERE id = quiz_id)
);

-- ALTER TABLE options ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can manage options of their questions" ON options FOR ALL USING (
--   auth.uid() IN (SELECT created_by FROM quizzes WHERE id IN (SELECT quiz_id FROM questions WHERE id = question_id))
-- );

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can select sessions they created" ON sessions FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can create sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Session owners can update" ON sessions FOR UPDATE USING (auth.uid() = created_by);

ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert themselves" ON session_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can select their participations" ON session_participants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow select in session" ON session_participants FOR SELECT USING (true);
CREATE POLICY "Session creators can view participants" ON session_participants FOR SELECT USING (
  session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid())
);

-- ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can insert their answers and select their own" ON answers FOR ALL USING (
--   participant_id IN (SELECT id FROM session_participants WHERE user_id = auth.uid())
-- );
-- CREATE POLICY "Session creators can view answers" ON answers FOR SELECT USING (
--   session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid())
-- );

-- ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session owners and participants can view scores" ON scores FOR SELECT USING (
  participant_id IN (SELECT id FROM session_participants WHERE user_id = auth.uid()) OR
  session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid())
);
CREATE POLICY "System can update scores" ON scores FOR INSERT WITH CHECK (true); -- Adjust if needed

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Session owners can view events" ON events FOR SELECT USING (
  session_id IN (SELECT id FROM sessions WHERE created_by = auth.uid())
);

-- Trigger para crear perfil en signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 'supervisor');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
