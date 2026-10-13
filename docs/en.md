# Île-de-France Mobilités

This integration follows **the public transport of the Paris region in real time** in Gladys: the next departures at your stops — **RER, Transilien, metro, tram, bus** — with their **delays** and **cancellations**, and the **traffic** of your lines (incidents, works). It turns them into devices, scene triggers ("my RER is cancelled", "my metro leaves in 5 minutes", "line 13 is disrupted") and dashboard widgets.

The data come from **PRIM**, the open data platform of Île-de-France Mobilités, and from its open reference data (lines and stops).

> Community integration, not affiliated with Île-de-France Mobilités, SNCF or RATP.

## Configuration

### 1. Get an API key (free)

1. Create an account on [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr).
2. In your account menu, open **Mes jetons d'authentification** (my authentication tokens), tab **API**, then click **Générer mon jeton**.
3. Copy the token right away: it is **shown only once** (generating a new one invalidates the old one).

A new account allows **1 000 requests a day per API**: enough for one or two stops with a travel window. For more, ask for a higher quota on the [Ma consommation API](https://prim.iledefrance-mobilites.fr/fr/ma-consommation-api) page (free, up to 1 000 000 a day for the departures), then enter the new quota in the **Daily quota of departures** setting.

### 2. The followed stops (up to 3)

| Field             | Role                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Stop**          | the name of the stop ("Massy - Palaiseau", "Châtelet") or its number given by **Find a stop** |
| **Line**          | optional but advised: "RER B", "Transilien P", "Métro 13", "T3a", "Bus 91", "C01743"          |
| **Direction**     | optional: words of the destination ("Robinson", "Saint-Rémy \| Massy" for two directions)     |
| **Travel window** | optional, e.g. `07:00-09:30`                                                                  |
| **Travel days**   | optional, e.g. Monday to Friday (empty: every day)                                            |

For a line without a mode, a letter is a train line ("B" = RER B, "P" = Transilien P) and a number a metro line before a bus line ("13" = metro 13). For a bus, type "Bus 91"; when several networks have a line with that number, use the id given by **Find a line** ("C01122").

With a line, the stop name is searched **among the stops of that line**: the most reliable. Without one, the integration takes the stop whose name matches exactly, train stations first, and shows **all** its lines. When it is not the right stop, use **Find a stop** and copy its number.

#### The travel window

The next departures are only known **two hours ahead**. With a travel window, the stop is read only from an hour before the window to its end, and **not at all** the rest of the time. It saves a lot of quota: a stop with a 2-hour window on weekdays costs about 65 requests a day, a stop read all day about 600.

When the configured stops would need more than the quota, the integration **spaces the reads by itself** (the **Test the connection** button shows the interval actually used).

### 3. Traffic

In **Followed lines**, type up to 6 lines separated by commas: `RER B, Transilien P, Métro 13`. The whole network is read in **one request** every 5 minutes (adjustable), about 290 requests a day whatever the number of lines.

A line is:

- **interrupted** when a blocking disruption applies (no train on all or part of the line);
- **disrupted** when a disruption applies without stopping the traffic (slowdowns, skipped stops…);
- **normal** otherwise. Mere information messages (a broken lift…) do not count.

Save, then click **Test the connection**: for each stop, it shows the departures found and the next one, the state of each line and the quota used.

### 4. Add the devices

On the **Discovery** tab, each stop shows up as "IDFM – _stop_ (_line_ → _direction_)" and each followed line as "IDFM – _line_ traffic". Add them and put them in a room.

| Device | Feature                  | Value                                                                   |
| ------ | ------------------------ | ----------------------------------------------------------------------- |
| Stop   | **Next departure**       | text, e.g. "07:42 · RER B KASE → Aéroport CDG 2 · +5 min"               |
| Stop   | **Leaves in**            | minutes, real time                                                      |
| Stop   | **Delay**                | minutes (timetabled trains; always 0 for the metro, which has none)     |
| Stop   | **Disrupted departures** | how many followed departures are late (from the threshold) or cancelled |
| Line   | **Traffic**              | text: "Normal traffic", "Disrupted: …", "Interrupted: …"                |
| Line   | **Current disruptions**  | the disruptions applying now (information messages left out)            |

The device names and the scene summaries follow the **Language of the texts** setting: English, French, German, Spanish, or automatic (the language of your dashboard, once an IDFM widget has been displayed).

On the **Devices** screen, the badge of each stop and line says **cloud** while the PRIM API answers, **unreachable** when its last read failed, and turns orange when the reads are paused by the daily quota.

## Scenes

### Triggers

| Trigger                          | When                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| **IDFM: train delayed**          | a followed train becomes late (from the threshold), then again at 15 and 30 min     |
| **IDFM: departure cancelled**    | a followed departure is cancelled                                                   |
| **IDFM: departure soon**         | a followed departure leaves in 2, 5, 10, 15, 20 or 30 minutes, on its **real** time |
| **IDFM: line disrupted**         | a new disruption applies to a followed line (filters: severity, incident/works)     |
| **IDFM: traffic back to normal** | a followed line that was disrupted runs normally again                              |

Every event carries a **Summary** variable, a sentence ready to send: "Massy - Palaiseau: the RER B KASE → Aéroport CDG 2 leaves in 15 min, at 07:42 (4 min late)." or "RER B: Interrupted. Trafic interrompu entre Massy et Paris.".

An event fires only once per departure or disruption, even after a restart.

### Actions

- **IDFM: next departures**: the next departure of a stop (line, destination, time, delay, platform…) and a summary.
- **IDFM: line traffic**: the state of a line, its main disruption and a summary.

## Widgets

![The "IDFM departures" widget (the next RER B at Massy - Palaiseau, one late, one cancelled) next to the "IDFM traffic" widget (the RER B interrupted, works planned on line 13) — generated illustration, not a screenshot](https://raw.githubusercontent.com/William-De71/gladys-idfm/main/docs/assets/widgets.en.png)

- **IDFM departures**: the next departures of a stop, like the station screens, with "N min", "+N min", "Cancelled" or "At the stop". Pick a followed stop, or type another stop (and its line) in the widget — it then spends the quota on every refresh.
- **IDFM traffic**: the state of each followed line (or of the ones typed in the widget), then the current disruptions and the ones planned in the next 24 hours; tap one to read the full message.

## FAQ

**No delay for the metro?** The metro and most buses have no timetable in the real-time data: only the wait is known. The delay and the "train delayed" trigger are for RER, Transilien and timetabled lines.

**The widget shows "Departures of 07:00-09:30 shown from 06:00".** That is expected: outside the travel window, the stop is not read.

**Device names or summaries in English?** Set **Language of the texts** in the settings, or open an IDFM widget once.

**"The PRIM API key is refused".** The token was miscopied or regenerated since: generate a new one and paste it.

**"Daily quota reached".** Add a travel window to your stops, slow the refresh down, or ask PRIM for a higher quota (free) and enter it in the settings.
