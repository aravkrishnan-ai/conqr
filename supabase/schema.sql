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
  perimeter float,
  center jsonb, -- { lat, lng }
  polygon jsonb, -- array of coords
  activity_id uuid
);

alter table public.territories enable row level security;

create policy "Territories are viewable by everyone"
  on public.territories for select using ( true );

create policy "Authenticated users can create territories"
  on public.territories for insert with check ( auth.role() = 'authenticated' );

create policy "Users can update own territories"
  on public.territories for update using ( auth.uid() = owner_id );

create policy "Users can delete own territories"
  on public.territories for delete using ( auth.uid() = owner_id );

-- Activities Table (Public read, owner write)
create table public.activities (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id),
    type text,
    start_time timestamptz,
    end_time timestamptz,
    distance float,
    duration float,
    polylines jsonb,
    is_synced boolean default false,
    territory_id uuid,
    average_speed float
);

alter table public.activities enable row level security;

-- Activities are viewable by all authenticated users (needed for viewing other user profiles)
create policy "Activities are viewable by everyone"
  on public.activities for select using ( true );

create policy "Users can insert own activities"
  on public.activities for insert with check ( auth.uid() = user_id );

create policy "Users can update own activities"
  on public.activities for update using ( auth.uid() = user_id );

create policy "Users can delete own activities"
  on public.activities for delete using ( auth.uid() = user_id );

-- RPC function for fetching user activities (bypasses RLS with SECURITY DEFINER)
create or replace function public.get_user_activities(target_user_id uuid)
returns setof public.activities
language sql
security definer
set search_path = public
as $$
  select * from public.activities
  where user_id = target_user_id
  order by start_time desc;
$$;

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
