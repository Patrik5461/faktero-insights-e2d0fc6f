-- Jediná funkcia v `public` bez pevného search_path (upozornenie Supabase advisora).
alter function public.vlastny_pristup_politiky_na(text, text, text) set search_path = public;
