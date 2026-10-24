-- OPTIONAL: sample listings so the website isn't empty while you test.
-- Every row is marked is_demo = true, so the site shows "Demo listing — not a
-- real offer". Delete them before launch:
--   delete from public.properties where is_demo;
-- Run in the Supabase SQL Editor AFTER you have created your brokerage.

with org as (select id from public.organizations order by created_at limit 1)
insert into public.properties
  (org_id, ref_code, title, transaction_type, category, property_type, configuration, locality,
   project_name, public_location, price, carpet_area, furnishing, possession_status, amenities,
   description, status, is_published, is_demo, last_verified_at, listing_source)
select org.id, v.* from org, (values
  ('DEMO-KHR-01', 'Demo: 2 BHK near Central Park', 'sale'::transaction_type, 'residential'::property_category, 'Apartment', '2 BHK', 'Kharghar',
   null, 'Sector 20', 9500000::numeric, 780::numeric, 'semi_furnished'::furnishing, 'ready_to_move'::possession_status,
   array['Lift','Parking','Gym'], 'Sample listing for testing the website.', 'available'::listing_status, true, true, now(), 'demo'),
  ('DEMO-VSH-02', 'Demo: 1 BHK for rent near station', 'rent', 'residential', 'Apartment', '1 BHK', 'Vashi',
   null, 'Sector 17', 32000, 520, 'fully_furnished', 'ready_to_move',
   array['Lift','Security'], 'Sample rental listing for testing.', 'available', true, true, now(), 'demo'),
  ('DEMO-BLP-03', 'Demo: Office space with parking', 'lease', 'commercial', 'Office', null, 'CBD Belapur',
   null, 'Near CBD station', 85000, 950, 'semi_furnished', 'ready_to_move',
   array['Power backup','Parking'], 'Sample commercial listing for testing.', 'available', true, true, now(), 'demo'),
  ('DEMO-ULW-04', 'Demo: 3 BHK under construction', 'sale', 'residential', 'Apartment', '3 BHK', 'Ulwe',
   null, 'Sector 19', 13500000, 1150, 'unfurnished', 'under_construction',
   array['Swimming pool','Club house','Lift'], 'Sample new-project listing for testing.', 'available', true, true, now(), 'demo')
) as v(ref_code, title, transaction_type, category, property_type, configuration, locality, project_name, public_location,
       price, carpet_area, furnishing, possession_status, amenities, description, status, is_published, is_demo, last_verified_at, listing_source)
on conflict (org_id, ref_code) do nothing;
