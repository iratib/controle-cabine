-- ============================================================
-- RÉALISATIONS AGENT — classement comparatif de l'équipe
-- À exécuter UNE FOIS dans Supabase SQL Editor.
--
-- Pourquoi : la RLS sur "vols" limite chaque agent à ses propres
-- lignes (agent_id = auth.uid()). Pour permettre à un agent de se
-- comparer aux autres (section "Réalisations" côté agent), on
-- expose uniquement des agrégats par catégorie d'avion (GP/MP)
-- — jamais le détail d'un vol — via une fonction "security definer"
-- qui contourne la RLS.
-- ============================================================

drop function if exists public.classement_agents();

create or replace function public.classement_agents_par_type()
returns table (
  agent_id uuid,
  nom text,
  matricule text,
  categorie text,
  total_vols bigint,
  total_c bigint,
  total_nc bigint,
  taux numeric
)
language sql
security definer
stable
as $$
  select
    p.id as agent_id,
    p.nom,
    p.matricule,
    case when v.type_vol like 'Gros Porteur%' then 'GP' else 'MP' end as categorie,
    count(distinct v.id) as total_vols,
    count(c.id) filter (where c.conformite = 'C') as total_c,
    count(c.id) filter (where c.conformite = 'NC') as total_nc,
    case when count(c.id) > 0
      then round(100.0 * count(c.id) filter (where c.conformite = 'C') / count(c.id)::numeric, 1)
      else null
    end as taux
  from public.profiles p
  join public.vols v
    on v.agent_id = p.id and v.statut = 'soumis'
  left join public.controles c on c.vol_id = v.id
  where p.role = 'agent'
  group by p.id, p.nom, p.matricule, categorie
  order by categorie, total_vols desc;
$$;

grant execute on function public.classement_agents_par_type() to authenticated;
