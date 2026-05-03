-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role          AS ENUM ('owner', 'customer');
CREATE TYPE public.order_status      AS ENUM ('placed','accepted','preparing','ready','served','completed','delivered','cancelled');
CREATE TYPE public.booking_status    AS ENUM ('pending','confirmed','checked_in','no_show','cancelled','completed');
CREATE TYPE public.loyalty_txn_type  AS ENUM ('earned','redeemed','manual');
CREATE TYPE public.notification_kind AS ENUM ('new_order','new_booking','new_customer','reward_redeemed','order_update','info');
CREATE TYPE public.payment_status    AS ENUM ('pending','paid','failed','refunded');
CREATE TYPE public.order_source      AS ENUM ('qr','app','walk_in','table');
CREATE TYPE public.reward_kind       AS ENUM ('points','visits','birthday','referral');
CREATE TYPE public.redemption_status AS ENUM ('pending','redeemed','cancelled');

-- ============================================================
-- TABLES
-- ============================================================
CREATE TABLE public.cafes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  logo_url TEXT,
  banner_url TEXT,
  description TEXT,
  currency TEXT DEFAULT 'INR',
  timezone TEXT DEFAULT 'Asia/Kolkata',
  opening_hours JSONB DEFAULT '{}'::jsonb,
  seating_capacity INT DEFAULT 0,
  slot_capacity INTEGER NOT NULL DEFAULT 4,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  points_per_currency NUMERIC NOT NULL DEFAULT 0.1,
  accept_online_orders BOOLEAN DEFAULT false,
  accept_reservations BOOLEAN DEFAULT false,
  table_ordering_enabled BOOLEAN NOT NULL DEFAULT false,
  loyalty_enabled BOOLEAN DEFAULT true,
  sound_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'customer',
  full_name TEXT,
  email TEXT,
  phone TEXT,
  birthday DATE,
  cafe_id UUID REFERENCES public.cafes(id) ON DELETE SET NULL,
  favorite_cafes UUID[] DEFAULT '{}',
  recent_cafes JSONB DEFAULT '[]',
  is_guest BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMPTZ,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  emoji TEXT,
  tags TEXT[] DEFAULT '{}',
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  status public.order_status NOT NULL DEFAULT 'placed',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  source public.order_source NOT NULL DEFAULT 'app',
  table_no TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  earned_points INT NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  booking_date DATE NOT NULL,
  booking_time TEXT NOT NULL,
  persons INT NOT NULL DEFAULT 1,
  status public.booking_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  required_points INT NOT NULL DEFAULT 100,
  kind public.reward_kind NOT NULL DEFAULT 'points',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loyalty_points INT NOT NULL DEFAULT 0,
  total_visits INT NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_memberships_cafe_customer_unique UNIQUE (cafe_id, customer_user_id)
);

CREATE TABLE public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points INT NOT NULL,
  type public.loyalty_txn_type NOT NULL DEFAULT 'earned',
  note TEXT,
  related_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.loyalty_rewards(id) ON DELETE CASCADE,
  reward_title TEXT NOT NULL,
  points_spent INT NOT NULL,
  code TEXT NOT NULL,
  status public.redemption_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ
);

CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  related_id UUID,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_menu_items_cafe              ON public.menu_items(cafe_id);
CREATE INDEX idx_orders_cafe_created          ON public.orders (cafe_id, created_at DESC);
CREATE INDEX idx_orders_customer              ON public.orders (customer_user_id, created_at DESC);
CREATE INDEX idx_orders_status                ON public.orders (cafe_id, status);
CREATE INDEX idx_orders_payment               ON public.orders (cafe_id, payment_status);
CREATE INDEX idx_bookings_cafe_date           ON public.bookings (cafe_id, booking_date);
CREATE INDEX idx_bookings_customer            ON public.bookings(customer_user_id);
CREATE INDEX idx_loyalty_memberships_cafe     ON public.loyalty_memberships(cafe_id);
CREATE INDEX idx_loyalty_memberships_customer ON public.loyalty_memberships(customer_user_id);
CREATE INDEX idx_activity_cafe                ON public.activity_logs(cafe_id, created_at DESC);
CREATE INDEX idx_cafes_city                   ON public.cafes(city);
CREATE INDEX idx_cafes_owner                  ON public.cafes(owner_user_id);
CREATE INDEX idx_notifications_owner          ON public.notifications(owner_user_id, read, created_at DESC);
CREATE INDEX idx_reward_redemptions_cafe      ON public.reward_redemptions(cafe_id, status, created_at DESC);
CREATE INDEX idx_reward_redemptions_customer  ON public.reward_redemptions(customer_user_id, created_at DESC);

-- HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_cafe_owner(_user_id UUID, _cafe_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cafes WHERE id = _cafe_id AND owner_user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.owns_order(_user_id UUID, _order_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id
      AND (o.customer_user_id = _user_id OR public.is_cafe_owner(_user_id, o.cafe_id))
  );
$$;

-- AUTH TRIGGERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _role public.app_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'customer');
  INSERT INTO public.profiles (user_id, role, full_name, email, phone, birthday, is_guest)
  VALUES (
    NEW.id, _role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NULLIF(NEW.raw_user_meta_data->>'birthday','')::DATE,
    COALESCE(NEW.is_anonymous, false)
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- GUEST MERGE
CREATE OR REPLACE FUNCTION public.merge_guest_into_user(
  _new_user_id UUID, _email TEXT, _phone TEXT
) RETURNS INT
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _guest RECORD; _moved INT := 0;
BEGIN
  IF _new_user_id IS NULL THEN RETURN 0; END IF;
  FOR _guest IN
    SELECT user_id FROM public.profiles
    WHERE is_guest = true
      AND user_id <> _new_user_id
      AND ((_email IS NOT NULL AND email = _email)
        OR (_phone IS NOT NULL AND phone = _phone))
  LOOP
    UPDATE public.orders               SET customer_user_id = _new_user_id WHERE customer_user_id = _guest.user_id;
    UPDATE public.bookings             SET customer_user_id = _new_user_id WHERE customer_user_id = _guest.user_id;
    UPDATE public.loyalty_transactions SET customer_user_id = _new_user_id WHERE customer_user_id = _guest.user_id;
    UPDATE public.reward_redemptions   SET customer_user_id = _new_user_id WHERE customer_user_id = _guest.user_id;

    INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
    SELECT cafe_id, _new_user_id, loyalty_points, total_visits, last_visit_at
      FROM public.loyalty_memberships WHERE customer_user_id = _guest.user_id
    ON CONFLICT (cafe_id, customer_user_id) DO UPDATE
      SET loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points,
          total_visits   = public.loyalty_memberships.total_visits   + EXCLUDED.total_visits,
          last_visit_at  = GREATEST(COALESCE(public.loyalty_memberships.last_visit_at, EXCLUDED.last_visit_at), EXCLUDED.last_visit_at);
    DELETE FROM public.loyalty_memberships WHERE customer_user_id = _guest.user_id;

    DELETE FROM public.profiles WHERE user_id = _guest.user_id;
    _moved := _moved + 1;
  END LOOP;
  RETURN _moved;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_claimed()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.is_anonymous IS TRUE OR OLD.is_anonymous IS NULL)
     AND NEW.is_anonymous IS FALSE
     AND (NEW.email IS NOT NULL OR NEW.phone IS NOT NULL) THEN
    UPDATE public.profiles
       SET is_guest = false,
           claimed_at = COALESCE(claimed_at, now()),
           email = COALESCE(NEW.email, email),
           phone = COALESCE(NEW.phone, phone)
     WHERE user_id = NEW.id;
    PERFORM public.merge_guest_into_user(NEW.id, NEW.email, NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_claimed
AFTER UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_user_claimed();

-- NOTIFICATION TRIGGERS
CREATE OR REPLACE FUNCTION public.notify_owner_new_order()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner UUID; _is_first BOOLEAN;
BEGIN
  SELECT owner_user_id INTO _owner FROM public.cafes WHERE id = NEW.cafe_id;
  IF _owner IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (owner_user_id, cafe_id, kind, title, body, related_id)
  VALUES (_owner, NEW.cafe_id, 'new_order',
    'New order from ' || NEW.customer_name,
    'Total: ' || NEW.total_amount::TEXT, NEW.id);
  IF NEW.customer_user_id IS NOT NULL THEN
    SELECT COUNT(*) = 1 INTO _is_first FROM public.orders
    WHERE cafe_id = NEW.cafe_id AND customer_user_id = NEW.customer_user_id;
    IF _is_first THEN
      INSERT INTO public.notifications (owner_user_id, cafe_id, kind, title, body, related_id)
      VALUES (_owner, NEW.cafe_id, 'new_customer', 'New customer joined',
        NEW.customer_name || ' placed their first order', NEW.customer_user_id);
    END IF;
  END IF;
  INSERT INTO public.activity_logs (cafe_id, message, kind)
  VALUES (NEW.cafe_id, 'New order from ' || NEW.customer_name, 'order');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_new_order AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_owner_new_order();

CREATE OR REPLACE FUNCTION public.notify_owner_new_booking()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner UUID;
BEGIN
  SELECT owner_user_id INTO _owner FROM public.cafes WHERE id = NEW.cafe_id;
  IF _owner IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (owner_user_id, cafe_id, kind, title, body, related_id)
  VALUES (_owner, NEW.cafe_id, 'new_booking',
    'New booking from ' || NEW.customer_name,
    NEW.booking_date::TEXT || ' at ' || NEW.booking_time || ' · ' || NEW.persons::TEXT || ' people',
    NEW.id);
  INSERT INTO public.activity_logs (cafe_id, message, kind)
  VALUES (NEW.cafe_id, 'New booking from ' || NEW.customer_name, 'booking');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_new_booking AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_owner_new_booking();

CREATE OR REPLACE FUNCTION public.notify_owner_reward_redeemed()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner UUID;
BEGIN
  IF NEW.type <> 'redeemed' THEN RETURN NEW; END IF;
  SELECT owner_user_id INTO _owner FROM public.cafes WHERE id = NEW.cafe_id;
  IF _owner IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (owner_user_id, cafe_id, kind, title, body, related_id)
  VALUES (_owner, NEW.cafe_id, 'reward_redeemed', 'Reward redeemed',
    ABS(NEW.points)::TEXT || ' points redeemed', NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_reward_redeemed AFTER INSERT ON public.loyalty_transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_owner_reward_redeemed();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bookings_touch BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.cafes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cafes_public_read" ON public.cafes FOR SELECT USING (true);
CREATE POLICY "cafes_owner_insert" ON public.cafes FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "cafes_owner_update" ON public.cafes FOR UPDATE USING (auth.uid() = owner_user_id);

CREATE POLICY "profiles_self_read"   ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_owner_read"  ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "profiles_owner_update" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "menu_public_read" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "menu_owner_insert" ON public.menu_items FOR INSERT WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "menu_owner_update" ON public.menu_items FOR UPDATE USING (public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "menu_owner_delete" ON public.menu_items FOR DELETE USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "orders_read" ON public.orders FOR SELECT
  USING (auth.uid() = customer_user_id OR public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "orders_insert_self" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = customer_user_id);
CREATE POLICY "orders_update" ON public.orders FOR UPDATE
  USING (public.is_cafe_owner(auth.uid(), cafe_id) OR auth.uid() = customer_user_id);

CREATE POLICY "order_items_read"   ON public.order_items FOR SELECT USING (public.owns_order(auth.uid(), order_id));
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT WITH CHECK (public.owns_order(auth.uid(), order_id));

CREATE POLICY "bookings_read"   ON public.bookings FOR SELECT USING (auth.uid() = customer_user_id OR public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "bookings_insert" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = customer_user_id);
CREATE POLICY "bookings_update" ON public.bookings FOR UPDATE USING (public.is_cafe_owner(auth.uid(), cafe_id) OR auth.uid() = customer_user_id);

CREATE POLICY "rewards_public_read" ON public.loyalty_rewards FOR SELECT USING (true);
CREATE POLICY "rewards_owner_insert" ON public.loyalty_rewards FOR INSERT WITH CHECK (public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "rewards_owner_update" ON public.loyalty_rewards FOR UPDATE USING (public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "rewards_owner_delete" ON public.loyalty_rewards FOR DELETE USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "loyalty_mem_read" ON public.loyalty_memberships FOR SELECT USING (auth.uid() = customer_user_id OR public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "loyalty_mem_insert" ON public.loyalty_memberships FOR INSERT WITH CHECK (auth.uid() = customer_user_id);
CREATE POLICY "loyalty_mem_update" ON public.loyalty_memberships FOR UPDATE USING (auth.uid() = customer_user_id OR public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "loyalty_txn_read" ON public.loyalty_transactions FOR SELECT USING (auth.uid() = customer_user_id OR public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "redemptions_read" ON public.reward_redemptions FOR SELECT USING (auth.uid() = customer_user_id OR public.is_cafe_owner(auth.uid(), cafe_id));
CREATE POLICY "redemptions_owner_update" ON public.reward_redemptions FOR UPDATE USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "activity_owner_read" ON public.activity_logs FOR SELECT USING (public.is_cafe_owner(auth.uid(), cafe_id));

CREATE POLICY "notif_read"   ON public.notifications FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE USING (auth.uid() = owner_user_id);

-- BUSINESS RPCs
CREATE OR REPLACE FUNCTION public.place_order_and_update_loyalty(
  _cafe_id uuid, _customer_user_id uuid, _customer_name text, _customer_phone text,
  _notes text, _source public.order_source, _table_no text, _items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _order_id uuid; _subtotal numeric := 0; _tax_rate numeric := 0;
  _tax_amount numeric := 0; _total numeric := 0; _accept_online boolean;
  _ppc numeric := 0; _earned integer := 0; _line jsonb; _item record; _qty integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _customer_user_id THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT tax_rate, accept_online_orders, points_per_currency
    INTO _tax_rate, _accept_online, _ppc FROM public.cafes WHERE id = _cafe_id;
  IF _tax_rate IS NULL THEN RAISE EXCEPTION 'Cafe not found'; END IF;
  IF _accept_online = false AND _source <> 'table' THEN RAISE EXCEPTION 'This cafe is not accepting online orders right now'; END IF;

  CREATE TEMP TABLE _resolved_items (menu_item_id uuid, name text, price numeric, quantity integer) ON COMMIT DROP;

  FOR _line IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_line->>'quantity')::int, 0);
    IF _qty < 1 OR _qty > 99 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT id, name, price, available, cafe_id INTO _item FROM public.menu_items WHERE id = (_line->>'menu_item_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'An item is no longer on the menu'; END IF;
    IF _item.cafe_id <> _cafe_id THEN RAISE EXCEPTION 'Item does not belong to this cafe'; END IF;
    IF _item.available = false THEN RAISE EXCEPTION '"%" is currently unavailable', _item.name; END IF;
    INSERT INTO _resolved_items VALUES (_item.id, _item.name, _item.price, _qty);
    _subtotal := _subtotal + (_item.price * _qty);
  END LOOP;

  _tax_amount := round((_subtotal * _tax_rate)::numeric, 2);
  _total := _subtotal + _tax_amount;
  _earned := floor(_subtotal * COALESCE(_ppc, 0))::int;

  INSERT INTO public.orders (cafe_id, customer_user_id, customer_name, customer_phone,
    notes, source, table_no, subtotal, tax_amount, total_amount, earned_points, status, payment_status)
  VALUES (_cafe_id, _customer_user_id, _customer_name, _customer_phone, _notes,
    COALESCE(_source,'app'), _table_no, _subtotal, _tax_amount, _total, _earned, 'placed', 'pending')
  RETURNING id INTO _order_id;

  INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity)
  SELECT _order_id, menu_item_id, name, price, quantity FROM _resolved_items;

  RETURN jsonb_build_object('id', _order_id, 'subtotal', _subtotal, 'tax_amount', _tax_amount,
    'total_amount', _total, 'earned_points', _earned);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_cafe_owner(auth.uid(), _o.cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _o.payment_status = 'paid' THEN RETURN jsonb_build_object('id', _o.id, 'already_paid', true); END IF;

  UPDATE public.orders SET payment_status = 'paid', paid_at = now(),
    status = CASE WHEN status = 'placed' THEN 'accepted'::public.order_status ELSE status END
   WHERE id = _order_id;

  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    INSERT INTO public.loyalty_memberships (cafe_id, customer_user_id, loyalty_points, total_visits, last_visit_at)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 1, now())
    ON CONFLICT (cafe_id, customer_user_id) DO UPDATE
      SET loyalty_points = public.loyalty_memberships.loyalty_points + EXCLUDED.loyalty_points,
          total_visits   = public.loyalty_memberships.total_visits + 1,
          last_visit_at  = now();

    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
    VALUES (_o.cafe_id, _o.customer_user_id, _o.earned_points, 'earned', 'Order #' || substr(_o.id::text, 1, 8), _o.id);
  END IF;

  RETURN jsonb_build_object('id', _o.id, 'paid', true, 'awarded_points', _o.earned_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o record;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_cafe_owner(auth.uid(), _o.cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _o.payment_status <> 'paid' THEN
    UPDATE public.orders SET status = 'cancelled', payment_status = 'failed' WHERE id = _order_id;
    RETURN;
  END IF;
  UPDATE public.orders SET payment_status = 'refunded', status = 'cancelled' WHERE id = _order_id;
  IF _o.customer_user_id IS NOT NULL AND _o.earned_points > 0 THEN
    UPDATE public.loyalty_memberships
       SET loyalty_points = GREATEST(0, loyalty_points - _o.earned_points)
     WHERE cafe_id = _o.cafe_id AND customer_user_id = _o.customer_user_id;
    INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note, related_order_id)
    VALUES (_o.cafe_id, _o.customer_user_id, -_o.earned_points, 'manual', 'Refund', _o.id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_reward(_reward_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user uuid := auth.uid(); _reward record; _points integer; _code text; _redemption_id uuid;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT id, cafe_id, title, required_points, active INTO _reward FROM public.loyalty_rewards WHERE id = _reward_id;
  IF NOT FOUND OR _reward.active = false THEN RAISE EXCEPTION 'Reward not available'; END IF;
  SELECT loyalty_points INTO _points FROM public.loyalty_memberships
    WHERE cafe_id = _reward.cafe_id AND customer_user_id = _user FOR UPDATE;
  IF _points IS NULL OR _points < _reward.required_points THEN RAISE EXCEPTION 'Not enough points'; END IF;
  UPDATE public.loyalty_memberships SET loyalty_points = loyalty_points - _reward.required_points
    WHERE cafe_id = _reward.cafe_id AND customer_user_id = _user;
  _code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.reward_redemptions (cafe_id, customer_user_id, reward_id, reward_title, points_spent, code, status)
  VALUES (_reward.cafe_id, _user, _reward.id, _reward.title, _reward.required_points, _code, 'pending')
  RETURNING id INTO _redemption_id;
  INSERT INTO public.loyalty_transactions (cafe_id, customer_user_id, points, type, note)
  VALUES (_reward.cafe_id, _user, -_reward.required_points, 'redeemed', _reward.title);
  RETURN jsonb_build_object('id', _redemption_id, 'code', _code, 'points_spent', _reward.required_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_redemption(_redemption_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cafe uuid;
BEGIN
  SELECT cafe_id INTO _cafe FROM public.reward_redemptions WHERE id = _redemption_id;
  IF _cafe IS NULL THEN RAISE EXCEPTION 'Redemption not found'; END IF;
  IF NOT public.is_cafe_owner(auth.uid(), _cafe) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.reward_redemptions SET status = 'redeemed', redeemed_at = now()
   WHERE id = _redemption_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_redemption_by_code(_cafe_id uuid, _code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rid uuid; _title text; _pts int;
BEGIN
  IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT id, reward_title, points_spent INTO _rid, _title, _pts FROM public.reward_redemptions
   WHERE cafe_id = _cafe_id AND upper(code) = upper(_code) AND status = 'pending' LIMIT 1;
  IF _rid IS NULL THEN RAISE EXCEPTION 'Code is invalid or already used'; END IF;
  UPDATE public.reward_redemptions SET status = 'redeemed', redeemed_at = now() WHERE id = _rid;
  RETURN jsonb_build_object('id', _rid, 'title', _title, 'points_spent', _pts);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_slot_availability(_cafe_id uuid, _date date, _time text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cap integer; _taken integer;
BEGIN
  SELECT slot_capacity INTO _cap FROM public.cafes WHERE id = _cafe_id;
  IF _cap IS NULL THEN _cap := 4; END IF;
  SELECT COALESCE(SUM(persons), 0) INTO _taken FROM public.bookings
    WHERE cafe_id = _cafe_id AND booking_date = _date AND booking_time = _time
    AND status NOT IN ('cancelled','no_show');
  RETURN jsonb_build_object('capacity', _cap * 8, 'taken', _taken, 'remaining', GREATEST(0, _cap * 8 - _taken));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_analytics(_cafe_id uuid, _start date, _end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _kpis jsonb; _series jsonb; _top jsonb;
BEGIN
  IF NOT public.is_cafe_owner(auth.uid(), _cafe_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT jsonb_build_object(
    'orders',   COUNT(*) FILTER (WHERE status NOT IN ('cancelled')),
    'paid_orders', COUNT(*) FILTER (WHERE payment_status = 'paid'),
    'pending_orders', COUNT(*) FILTER (WHERE payment_status = 'pending' AND status NOT IN ('cancelled')),
    'revenue',  COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0),
    'avg_ticket', COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'paid'), 0),
    'new_customers', (SELECT COUNT(DISTINCT customer_user_id) FROM public.orders
                      WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                        AND created_at::date BETWEEN _start AND _end
                        AND customer_user_id NOT IN (
                          SELECT customer_user_id FROM public.orders
                          WHERE cafe_id = _cafe_id AND customer_user_id IS NOT NULL
                            AND created_at::date < _start
                        ))
  ) INTO _kpis FROM public.orders
  WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end;

  SELECT jsonb_agg(jsonb_build_object('date', d::date, 'orders', COALESCE(o.cnt, 0), 'revenue', COALESCE(o.rev, 0)) ORDER BY d) INTO _series
  FROM generate_series(_start, _end, interval '1 day') d
  LEFT JOIN (
    SELECT created_at::date AS day, COUNT(*) AS cnt,
           COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS rev
      FROM public.orders WHERE cafe_id = _cafe_id AND created_at::date BETWEEN _start AND _end
     GROUP BY 1
  ) o ON o.day = d::date;

  SELECT jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', rev) ORDER BY qty DESC) INTO _top
  FROM (
    SELECT oi.name, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.price) AS rev
      FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
     WHERE o.cafe_id = _cafe_id AND o.created_at::date BETWEEN _start AND _end
       AND o.status NOT IN ('cancelled')
     GROUP BY oi.name ORDER BY qty DESC LIMIT 5
  ) t;

  RETURN jsonb_build_object('kpis', _kpis, 'series', COALESCE(_series, '[]'::jsonb), 'top_items', COALESCE(_top, '[]'::jsonb));
END;
$$;

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reward_redemptions;

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.loyalty_memberships REPLICA IDENTITY FULL;
ALTER TABLE public.reward_redemptions REPLICA IDENTITY FULL;