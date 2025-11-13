// sequenceDef.ts

// ---- Types ----
export type Pose = { name: string; isTwoSided: boolean };
export type SequenceGroup = Pose[];
export type SequenceDefinition = {
    name: string;
    description?: string;
    poses: SequenceGroup;
};

// Optional string union you can reuse elsewhere
export type GroupKey =
    | 'SUN'
    | 'STANDING'
    | 'PRIMARY_ONLY'
    | 'INTERMEDIATE_ONLY'
    | 'ADVANCED_A_ONLY'
    | 'ADVANCED_B_ONLY'
    | 'FINISHING';

// ---- Tiny helpers to reduce boilerplate ----
const S = (name: string): Pose => ({ name, isTwoSided: false });
const LR = (name: string): Pose => ({ name, isTwoSided: true });

// ---- Chunks (canonical, ordered) ----

// 1) Sun
export const sunSalutations: SequenceGroup = [
    S('Surya Namaskar A'),
    S('Surya Namaskar B'),
];

// 2) Shared Standing
export const sharedStanding: SequenceGroup = [
    S('Padangusthasana'),
    S('Padahastasana'),
    LR('Utthita Trikonasana'),
    LR('Parivrtta Trikonasana'),
    LR('Utthita Parsvakonasana'),
    LR('Parivrtta Parsvakonasana'),
    S('Prasarita Padottanasana A'),
    S('Prasarita Padottanasana B'),
    S('Prasarita Padottanasana C'),
    S('Prasarita Padottanasana D'),
    LR('Parsvottanasana'),
];

// 3) Shared Finishing
export const sharedFinishing: SequenceGroup = [
    S('Urdhva Dhanurasana'),
    S('Paschimottanasana'),
    S('Salamba Sarvangasana'),
    S('Halasana'),
    S('Karnapidasana'),
    S('Urdva Padmasana'), // keeping your spelling as-is
    S('Pindasana'),
    S('Matsyasana'),
    S('Uttana Padasana'),
    S('Sirsasana A'),
    S('Sirsasana B'),
    S('Sirsasana C'),
    S('Yoga Mudra Asana'),
    S('Padmasana'),
    S('Utpluthih'),
    S('Savasana'),
];

// 4) Series-only chunks (no standing/finishing inside)
export const primaryOnly: SequenceGroup = [
    LR('Utthita Hasta Padangusthasana'),
    LR('Ardha Baddha Padmottanasana'),
    S('Uttkatasana'),
    LR('Virabhadrasana I'),
    LR('Virabhadrasana II'),
    S('Dandasana'),
    S('Paschimottanasana A'),
    S('Paschimottanasana B'),
    S('Paschimottanasana C'),
    S('Purvottanasana'),
    LR('Ardha Baddha Padma Paschimottanasana'),
    LR('Triang Mukha Eka Pada Paschimottanasana'),
    LR('Janu Sirsasana A'),
    LR('Janu Sirsasana B'),
    LR('Janu Sirsasana C'),
    LR('Marichyasana A'),
    LR('Marichyasana B'),
    LR('Marichyasana C'),
    LR('Marichyasana D'),
    S('Navasana'),
    S('Bujapidasana'),
    S('Kurmasana'),
    S('Supta Kurmasana'),
    S('Garbha Pindasana'),
    S('Kukkutasana'),
    S('Baddha Konasana A'),
    S('Baddha Konasana B'),
    S('Baddha Konasana C'),
    S('Upavistha Konasana A'),
    S('Upavistha Konasana B'),
    S('Supta Konasana'),
    LR('Supta Padangusthasana'),
    S('Ubhaya Padangusthasana'),
    S('Urdva Mukha Paschimottanasana'),
    S('Setu Bandhasana'),
];

export const intermediateOnly: SequenceGroup = [
    S('Pasasana'),
    S('Krounchasana'),
    S('Shalabhasana A'),
    S('Shalabhasana B'),
    S('Bhekasana'),
    S('Dhanurasana'),
    LR('Parsva Dhanurasana'),
    S('Ustrasana'),
    S('Laghu Vajrasana'),
    S('Kapotasana A'),
    S('Kapotasana B'),
    S('Supta Vajrasana'),
    S('Bakasana A'),
    S('Bakasana B'),
    LR('Bharadvajasana'),
    LR('Ardha Matsyendrasana'),
    LR('Eka Pada Sirsasana'),
    S('Dwi Pada Sirsasana'),
    S('Tittibhasana A'),
    S('Tittibhasana B'),
    S('Tittibhasana C'),
    S('Pincha Mayurasana'),
    S('Karandavasana'),
    S('Mayurasana'),
    S('Nakrasana'),
    LR('Vatayanasana'),
    LR('Parighasana'),
    LR('Gomukhasana A'),
    LR('Gomukhasana B'),
    LR('Supta Urdhva Pada Vajrasana'),
    S('Muka Hasta Sirsasana A'),
    S('Muka Hasta Sirsasana B'),
    S('Muka Hasta Sirsasana C'),
    S('Baddha Hasta Sirsasana A'),
    S('Baddha Hasta Sirsasana B'),
    S('Baddha Hasta Sirsasana C'),
    S('Baddha Hasta Sirsasana D'),
];

export const advancedAOnly: SequenceGroup = [
    LR('Vasisthasana'),
    LR('Vishvamitrasana'),
    LR('Kasyapasana'),
    LR('Chakorasana'),
    LR('Bhairvasana'),
    LR('Skandasana'),
    LR('Durvasasana'),
    S('Urdhva Kukkutasana A'),
    S('Urdhva Kukkutasana B'),
    S('Urdhva Kukkutasana C'),
    LR('Galavasana'),
    LR('Eka Pada Bakasana A'),
    LR('Eka Pada Bakasana B'),
    LR('Koundinyanasana A'),
    LR('Koundinyanasana B'),
    LR('Astavakrasana A'),
    LR('Astavakrasana B'),
    LR('Purna Matsyendrasana'),
    LR('Viranchyasana A'),
    LR('Viranchyasana B'),
    S('Viparita Dandasana'),
    LR('Eka Pada Viparita Dandasana'),
    S('Viparita Salabhasana'),
    S('Ganda Bherundasana A'),
    S('Ganda Bherundasana B'),
    LR('Hanumanasana A'),
    LR('Hanumanasana B'),
    LR('Supta Trivikramasana'),
    LR('Dighasana A'),
    LR('Dighasana B'),
    LR('Trivikramasana'),
    LR('Natarajasana'),
    S('Raja Kapotasana'),
    LR('Eka Pada Raja kapotasana'),
];

export const advancedBOnly: SequenceGroup = [
    S('Mula Bandhasana'),
    S('Nahusasana A'),
    S('Nahusasana B'),
    S('Nahusasana C'),
    S('Vrschikasana'),
    S('Sayanasana'),
    LR('Buddhasana'),
    LR('Kapilasana'),
    LR('Akarna Dhanurasana A'),
    LR('Akarna Dhanurasana B'),
    S('Padangustha Dhanurasana A'),
    S('Padangustha Dhanurasana B'),
    LR('Marichyasana E'),
    LR('Marichyasana F'),
    LR('Marichyasana G'),
    LR('Marichyasana H'),
    S('Tadasana'),
    LR('Samanasana'),
    LR('Punga Kukkutasana'),
    LR('Parsva Bakasana'),
    LR('Eka Pada Dhanurasana A'),
    LR('Eka Pada Dhanurasana B'),
    LR('Eka Pada Kapotasana A'),
    LR('Eka Pada Kapotasana B'),
    S('Paryangasana A'),
    S('Paryangasana B'),
    S('Parivrttasana A'),
    S('Parivrttasana B'),
    LR('Yoni Dandasana A'),
    LR('Yoni Dandasana B'),
    LR('Yoga Dandasana'),
    LR('Bhuja Dandasana'),
    LR('Parsva Dandasana'),
    LR('Adho Dandasana'),
    LR('Urdhva Dandasana'),
    S('Sama Konasana'),
    LR('Omkarasana'),
];

// ---- Central catalog so you can compose anything without repetition ----
export const CATALOG: Record<GroupKey, SequenceGroup> = {
    SUN: sunSalutations,
    STANDING: sharedStanding,
    FINISHING: sharedFinishing,
    PRIMARY_ONLY: primaryOnly,
    INTERMEDIATE_ONLY: intermediateOnly,
    ADVANCED_A_ONLY: advancedAOnly,
    ADVANCED_B_ONLY: advancedBOnly,
};

// Compose helper (keeps order)
export const compose = (...groups: GroupKey[]): SequenceGroup =>
    groups.flatMap((g) => CATALOG[g]);

// ---- Ready-made Series (kept for compatibility with your existing code/seed) ----
export const primarySeries: SequenceDefinition = {
    name: 'Ashtanga Primary Series',
    description: 'The first series of Ashtanga Yoga, also known as Yoga Chikitsa (Yoga Therapy).',
    poses: compose('STANDING', 'PRIMARY_ONLY', 'FINISHING'),
};

export const intermediateSeries: SequenceDefinition = {
    name: 'Ashtanga Intermediate Series',
    description: 'The second series of Ashtanga Yoga, also known as Nadi Shodhana (Nerve Purification).',
    poses: compose('STANDING', 'INTERMEDIATE_ONLY', 'FINISHING'),
};

export const advancedASeries: SequenceDefinition = {
    name: 'Ashtanga Advanced A Series',
    description: 'The third series of Ashtanga Yoga, also known as Sthira Bhaga (Strength and Grace).',
    poses: compose('STANDING', 'ADVANCED_A_ONLY', 'FINISHING'),
};

export const advancedBSeries: SequenceDefinition = {
    name: 'Ashtanga Advanced B Series',
    description: 'The fourth series of Ashtanga Yoga, also known as Sthira Bhaga (Strength and Grace).',
    poses: compose('STANDING', 'ADVANCED_B_ONLY', 'FINISHING'),
};
