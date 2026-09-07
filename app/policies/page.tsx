import { Back } from '@/components/ui';
export default function Policies() {
  return (
    <div className="page narrow policy-text">
      <Back />
      <p className="eyebrow">A FEW THINGS TO KNOW</p>
      <h1>Ordering, privacy & support</h1>
      <div className="hint">
        Pilot policy draft. The platform owner must add verified business and support details and
        review this content before accepting real customers.
      </div>
      <h2>Ordering from your neighbourhood</h2>
      <p>
        HomeBite connects customers with participating kitchens and delivery riders in the Bengaluru
        pilot area. Delivery is available within 12 km of central Bengaluru. Kitchens control their
        menus, listed hours, availability, and whether they are accepting orders.
      </p>
      <p>
        The checkout shows the food subtotal and a ₹35 delivery fee. All amounts are in Indian
        rupees. Payment is cash on delivery. No online payment or card details are collected. A
        kitchen may decline an order when it cannot fulfil it.
      </p>
      <h2>Cancellations & delivery issues</h2>
      <p>
        You can cancel from the tracking screen before the kitchen accepts your order. An order that
        is cancelled or declined before delivery does not collect payment. After acceptance, contact
        the platform operator for help; self-service cancellation is unavailable.
      </p>
      <p>
        If no rider is available, the order remains at “Finding a rider” and the kitchen and
        platform operator can see the delay. Displayed delivery times are estimates. If food is
        missing, incorrect, or unsuitable, record the order number and contact the operator
        promptly. Any remedy for a paid cash order is handled manually; the app does not issue
        automatic refunds.
      </p>
      <h2>Your information</h2>
      <p>
        Your account stores your name, email, phone number, and role. Orders store delivery details,
        selected food, prices, and status history. The assigned kitchen and rider receive the
        information needed to prepare and deliver your order. Platform administrators can review
        operational records.
      </p>
      <p>
        Online riders share location with the platform to match nearby pickups. Customers can see
        their assigned rider’s latest location during an active delivery. Location sharing needs
        browser permission and an open rider window. Going offline stops location updates from that
        window.
      </p>
      <p>
        Supabase provides account and order storage in live mode. Map tiles are loaded from
        OpenStreetMap, and the interface may request fonts from Google Fonts and partner-supplied
        image hosts. These services receive standard browser request information. Your basket is
        stored on this device. Demo mode stores fictional orders and roles locally and never places
        a real food order.
      </p>
      <h2>Support & account requests</h2>
      <p>
        Production support contact, operating business identity, retention schedule, and a process
        for account and data requests must be configured by the operator before launch. This pilot
        build does not provide a staffed support service.
      </p>
      <h2>Kitchen & rider partners</h2>
      <p>
        Partner accounts need manual approval. Kitchens must maintain accurate menus, addresses,
        opening availability, and food information. Riders must use their own verified account and
        confirm both delivery and cash collection. Earnings and settlement records are informational
        until the operator reconciles payment separately.
      </p>
    </div>
  );
}
