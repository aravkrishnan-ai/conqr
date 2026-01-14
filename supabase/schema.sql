-- Create a public profiles table that references auth.users
create table public.users (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  email text,
  bio text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.users enable row level security;

-- Policies for Profiles
create policy "Public profiles are viewable by everyone."
  on public.users for select using ( true );

create policy "Users can insert their own profile."
  on public.users for insert with check ( auth.uid() = id );

create policy "Users can update own profile."
  on public.users for update using ( auth.uid() = id );

-- Territories Table
create table public.territories (
  id uuid default gen_random_uuid() primary key,
  name text,
  owner_id uuid references public.users(id),
  claimed_at timestamptz default now(),
  area float,
  center jsonb, -- { lat, lng }
  polygon jsonb, -- array of coords
  activity_id uuid
);

alter table public.territories enable row level security;

create policy "Territories are viewable by everyone"
  on public.territories for select using ( true );

create policy "Authenticated users can create territories"
  on public.territories for insert with check ( auth.role() = 'authenticated' );

-- Activities Table (Private)
create table public.activities (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    type text,
    start_time timestamptz,
    distance float,
    duration float,
    polylines jsonb
);

alter table public.activities enable row level security;

create policy "Users can see own activities"
  on public.activities for select using ( auth.uid() = user_id );

create policy "Users can insert own activities"
  on public.activities for insert with check ( auth.uid() = user_id );

-- Handle new user signup automatically (Optional, but good practice)
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.users (id, email, username, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
