import {
  poseSetProfileKey,
  type PoseSetDefinition,
  type SeatPoseProfile,
} from './types';

export const DEFAULT_CHAIR_POSE_SET_ID = 1;
export const DEFAULT_BENCH_POSE_SET_ID = 2;

export function createDefaultPoseSets(): Map<number, PoseSetDefinition> {
  return new Map([
    [DEFAULT_CHAIR_POSE_SET_ID, {
      id: DEFAULT_CHAIR_POSE_SET_ID,
      name: 'Standard Chair',
      action: 'sit',
    }],
    [DEFAULT_BENCH_POSE_SET_ID, {
      id: DEFAULT_BENCH_POSE_SET_ID,
      name: 'Standard Bench',
      action: 'sit',
    }],
  ]);
}

const profiles: SeatPoseProfile[] = [
  {
    seatType: 'chair', direction: 'north', width: 64, height: 64, horizontal: false,
    hip: { start: { x: 38, y: 50 }, end: { x: 57, y: 45 } },
    knee: { start: { x: 43, y: 58 }, end: { x: 60, y: 52 } },
    ankle: { start: { x: 49, y: 61 }, end: { x: 62, y: 56 } },
    torsoAngle: 0, hipAngle: -120, kneeAngle: 140, bend: 0, shinBend: 0,
    hipSplitOffset: 0, kneeSplitOffset: 0,
    torsoCut: { x: 1, y: 17 }, thighCut: { x: -19, y: -14 }, shinCut: { x: 2, y: 15 },
    torsoLean: 0,
    drawLayers: [
      { region: 2, visible: true }, { region: 3, visible: true }, { region: 1, visible: true },
    ],
    playerOffset: { x: 1, y: -28 }, benchOffset: { x: 0, y: 0 },
    maskRanges: {
      1: '1695-1699,1758-1764,1821-1829,1884-1894,1948-1959,2012-2023,2076-2088,2140-2153,2205-2217,2270-2280,2335-2348,2399-2414,2463-2479,2527-2544,2591-2609,2656-2674,2720-2739,2785-2805,2849-2871,2914-2937,2979-3002,3045-3059,3062-3067,3112-3123,3128-3131,3177-3187,3193-3194,3241-3250,3306-3312',
      2: '3502-3504,3567-3569,3632-3634,3696-3699,3761-3763,3826-3829,3891-3893,3956-3957',
      3: '3643-3645,3705-3710,3768-3775,3833-3839,3897-3903,3962-3966,4027-4030,4092-4093',
      4: '',
      5: '3061,3124,3188-3189,3251-3254,3305,3313-3319,3370-3384,3435-3449,3500-3501,3505-3513,3565-3566,3570,3572-3578,3630-3631,3635-3642,3695,3700-3704,3759-3760,3764-3767,3824-3825,3830-3832,3889-3890,3894-3895,3954-3955,3958,4019-4022,4084-4085',
    },
  },
  {
    seatType: 'bench', direction: 'south', width: 64, height: 64, horizontal: false,
    hip: { start: { x: 0, y: 47 }, end: { x: 63, y: 47 } },
    knee: { start: { x: 0, y: 55 }, end: { x: 63, y: 55 } },
    ankle: { start: { x: 0, y: 57 }, end: { x: 63, y: 57 } },
    torsoAngle: 0, hipAngle: 0, kneeAngle: 0, bend: -6, shinBend: 0,
    hipSplitOffset: 2, kneeSplitOffset: -1,
    torsoCut: { x: 0, y: 0 }, thighCut: { x: 0, y: 0 }, shinCut: { x: 0, y: -1 },
    torsoLean: -1,
    drawLayers: [
      { region: 1, visible: true }, { region: 2, visible: true }, { region: 3, visible: true },
    ],
    playerOffset: { x: 5, y: 4 }, benchOffset: { x: 0, y: 0 },
    maskRanges: {
      1: '1628-1632,1691-1697,1754-1762,1817-1827,1881-1891,1945-1956,2009-2021,2074-2085,2139-2149,2204-2215,2269-2283,2334-2349,2398-2412,2462-2475,2528-2539,2594-2604,2660-2670,2724-2734,2789-2799,2854-2864,2919-2928,2983-2991,3048-3053,3113-3114',
      2: '2929,2992-2993,3054-3058,3115-3123,3174-3187,3238-3251,3303-3317,3319-3320,3370-3385,3435-3447,3500-3504',
      3: '3448-3450,3505-3506,3509-3515,3565-3571,3574-3580,3631-3636,3640-3645,3697-3701,3706-3710,3762-3765,3771-3774,3826-3830,3835-3839,3890-3894,3899-3903,3954-3958,3963-3967,4018-4021,4027-4030,4083-4084,4092-4093',
      4: '2413-2414,2476-2479,2526-2527,2540-2544,2590-2593,2605-2609,2655-2659,2671-2674,2720-2723,2735-2739,2785-2788,2800-2804,2850-2853,2865-2868,2914-2918,2930-2933,2979-2982,2994-2997,3044-3047,3059-3062,3108-3112,3124-3127,3173,3188-3191,3252-3255,3318',
      5: '',
    },
  },
  {
    seatType: 'bench', direction: 'east', width: 64, height: 64, horizontal: true,
    hip: { start: { x: 42, y: 58 }, end: { x: 55, y: 28 } },
    knee: { start: { x: 48, y: 60 }, end: { x: 58, y: 33 } },
    ankle: { start: { x: 55, y: 63 }, end: { x: 60, y: 43 } },
    torsoAngle: 0, hipAngle: 0, kneeAngle: 0, bend: -5, shinBend: -1,
    hipSplitOffset: 0, kneeSplitOffset: 0,
    torsoCut: { x: 0, y: 0 }, thighCut: { x: 0, y: 0 }, shinCut: { x: 0, y: 0 },
    torsoLean: 1,
    drawLayers: [
      { region: 1, visible: true }, { region: 2, visible: true }, { region: 3, visible: true },
    ],
    playerOffset: { x: 5, y: -2 }, benchOffset: { x: 0, y: 0 },
    maskRanges: {
      1: '1628-1631,1691-1696,1754-1761,1817-1826,1881-1891,1945-1960,2009-2025,2073-2090,2138-2155,2203-2220,2268-2284,2334-2348,2399-2412,2466-2476,2530-2540,2595-2604,2659-2668,2723-2732,2787-2796,2852-2860,2916-2924,2981-2988,3046-3052,3111-3116,3176-3180,3241-3244,3306-3308,3371-3372',
      2: '2221,2285-2286,2349-2352,2413-2417,2477-2482,2541-2547,2605-2611,2669-2675,2733-2740,2797-2804,2861-2868,2925-2932,2989-2996,3053-3060,3117-3124,3181-3188,3245-3252,3309-3316,3373-3380,3437-3444,3503-3508,3568-3572,3635-3636,3700',
      3: '2805,2869-2870,2933-2935,2997-2999,3061-3064,3125-3128,3189-3193,3253-3262,3317,3319-3327,3381,3384-3391,3445-3446,3449-3454,3509-3511,3515-3517,3573-3575,3637-3640,3701-3704,3765-3769,3830-3838,3895-3903,3960-3967,4025-4030,4091-4093',
      4: '',
      5: '',
    },
  },
  {
    seatType: 'chair', direction: 'west', width: 64, height: 64, horizontal: false,
    hip: { start: { x: 54, y: 39 }, end: { x: 48, y: 63 } },
    knee: { start: { x: 59, y: 42 }, end: { x: 53, y: 63 } },
    ankle: { start: { x: 63, y: 43 }, end: { x: 57, y: 63 } },
    torsoAngle: 0, hipAngle: 120, kneeAngle: -117, bend: 0, shinBend: 2,
    hipSplitOffset: 0, kneeSplitOffset: 0,
    torsoCut: { x: -7, y: 1 }, thighCut: { x: 0, y: 11 }, shinCut: { x: -15, y: -1 },
    torsoLean: 5,
    drawLayers: [
      { region: 2, visible: true }, { region: 3, visible: true }, { region: 1, visible: true },
    ],
    playerOffset: { x: 0, y: 0 }, benchOffset: { x: 0, y: 0 },
    maskRanges: {
      1: '1821-1825,1884-1890,1947-1955,2010-2024,2074-2090,2138-2156,2202-2221,2266-2286,2331-2350,2396-2415,2461-2479,2526-2543,2592-2608,2657-2658,2660-2672,2724-2736,2788-2800,2852-2864,2917-2928,2981-2992,3046-3056,3111-3120,3176-3183,3241-3246,3306-3310,3371-3374,3435-3439,3500-3503,3564-3567,3629-3632,3693-3697,3758-3761,3823-3824',
      2: '2934-2935,2998-3000,3062-3066,3125-3131,3189-3196,3253-3261,3316-3318,3320-3326,3380-3391,3444-3455,3506-3518,3571-3575,3579-3580,3636-3638,3701',
      3: '3576-3578,3639-3643,3702-3708,3767-3773,3832-3838,3896-3903,3960-3967,4025-4030,4090-4092',
      4: '',
      5: '2673-2675,2737-2740,2801-2805,2865-2870,2929-2933,2993-2997,3057-3061,3121-3124,3184-3188,3247-3252,3311-3315,3376-3379,3441-3443',
    },
  },
];

export function createDefaultSeatPoseProfiles(): Map<string, SeatPoseProfile> {
  return new Map(profiles.map((profile) => {
    const poseSetId = profile.seatType === 'chair'
      ? DEFAULT_CHAIR_POSE_SET_ID
      : DEFAULT_BENCH_POSE_SET_ID;
    const { seatType: _legacySeatType, variant: _legacyVariant, ...pose } = structuredClone(profile);
    const migrated = {
      ...pose,
      poseSetId,
      action: 'sit' as const,
    };
    return [poseSetProfileKey(poseSetId, profile.direction), migrated];
  }));
}
