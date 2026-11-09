-- Wab proactive transaction alerts.
-- Deterministic checks run at insert time; no model is allowed to invent a risk event.

CREATE OR REPLACE FUNCTION public.notify_transaction_risk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prior_quantity numeric := 0;
  v_title text;
  v_message text;
  v_severity text := 'warning';
BEGIN
  IF NEW.status <> 'posted' THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'SELL' THEN
    SELECT COALESCE(SUM(
      CASE WHEN action = 'BUY' THEN quantity
           WHEN action = 'SELL' THEN -quantity
           ELSE 0 END
    ), 0)
    INTO v_prior_quantity
    FROM public.transactions
    WHERE org_id = NEW.org_id
      AND ticker = NEW.ticker
      AND status = 'posted'
      AND trade_date <= NEW.trade_date
      AND id <> NEW.id;

    IF NEW.quantity > v_prior_quantity THEN
      v_title := 'Trade review: possible oversell';
      v_message := format(
        '%s sell quantity (%s) exceeds the recorded available quantity (%s). Check the trade and earlier ledger entries.',
        NEW.ticker, NEW.quantity, GREATEST(v_prior_quantity, 0)
      );
      v_severity := 'error';
    END IF;
  END IF;

  IF v_title IS NULL AND EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.org_id = NEW.org_id
      AND t.id <> NEW.id
      AND t.status = 'posted'
      AND upper(t.ticker) = upper(NEW.ticker)
      AND t.action = NEW.action
      AND t.trade_date = NEW.trade_date
      AND t.quantity = NEW.quantity
      AND t.price = NEW.price
  ) THEN
    v_title := 'Trade review: possible duplicate';
    v_message := format(
      'A matching %s entry for %s (%s shares at %s) already exists on %s. Verify before keeping both records.',
      NEW.action, NEW.ticker, NEW.quantity, NEW.price, NEW.trade_date
    );
  END IF;

  IF v_title IS NULL AND COALESCE(NEW.fees, 0) > 0
     AND NEW.quantity * NEW.price > 0
     AND NEW.fees / (NEW.quantity * NEW.price) >= 0.03 THEN
    v_title := 'Trade review: unusually high fees';
    v_message := format(
      'Recorded fees for %s are %.2f%% of trade value. Check the broker contract note.',
      NEW.ticker, 100 * NEW.fees / (NEW.quantity * NEW.price)
    );
  END IF;

  IF v_title IS NOT NULL THEN
    INSERT INTO public.notifications (org_id, user_id, type, title, message, severity, link, metadata)
    SELECT NEW.org_id, p.user_id, 'trade_risk', v_title, v_message, v_severity,
           '/app/reconciliation',
           jsonb_build_object('transaction_id', NEW.id, 'ticker', NEW.ticker, 'source', 'database_rule')
    FROM public.profiles p
    WHERE p.org_id = NEW.org_id
      AND p.user_id IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_proactive_risk_alert ON public.transactions;
CREATE TRIGGER transactions_proactive_risk_alert
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_transaction_risk();
