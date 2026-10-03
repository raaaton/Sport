import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type RestLiveActivityProps = {
  workoutId: string;
  restTimerId: string;
  exerciseName: string;
  nextSetNumber: number;
  targetSets: number;
  state: 'running' | 'paused';
  restStartedAt: string;
  restEndsAt: string | null;
  pausedRemainingSeconds: number | null;
};

const RestLiveActivityLayout = (props: RestLiveActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const primary = { type: 'hierarchical' as const, style: 'primary' as const };
  const secondary = { type: 'hierarchical' as const, style: environment.isLuminanceReduced ? 'primary' as const : 'secondary' as const };
  const islandPrimary = '#FFFFFF';
  const islandSecondary = '#D1D1D6';
  const minutes = Math.floor((props.pausedRemainingSeconds ?? 0) / 60);
  const seconds = String((props.pausedRemainingSeconds ?? 0) % 60).padStart(2, '0');
  const remaining = props.state === 'paused' ? `${minutes}:${seconds}` : null;
  const expired = props.state === 'running' && environment.isStale === true;
  const endDate = props.restEndsAt ? new Date(props.restEndsAt) : new Date();
  const heading = expired ? 'PRÊT' : props.state === 'paused' ? 'PAUSE' : 'REST';
  const fixedTime = expired ? '0:00' : remaining;

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 16 })]}>
        <HStack spacing={8}>
          <Text modifiers={[font({ weight: 'bold', size: 13 }), foregroundStyle(secondary)]}>{heading}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>·</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{props.nextSetNumber}/{props.targetSets}</Text>
        </HStack>
        <Text modifiers={[font({ weight: 'bold', size: 20 }), foregroundStyle(primary)]}>{props.exerciseName}</Text>
        {props.state === 'paused' || expired
          ? <Text modifiers={[font({ weight: 'bold', size: 32, design: 'rounded' }), foregroundStyle(primary)]}>{fixedTime}</Text>
          : <Text date={endDate} dateStyle="timer" modifiers={[font({ weight: 'bold', size: 32, design: 'rounded' }), foregroundStyle(primary)]} />}
        <Text modifiers={[font({ size: 14 }), foregroundStyle(secondary)]}>Prochaine série · {props.nextSetNumber}/{props.targetSets}</Text>
      </VStack>
    ),
    compactLeading: <Text modifiers={[font({ weight: 'bold', size: 11 }), foregroundStyle(islandPrimary)]}>REST</Text>,
    compactTrailing: props.state === 'paused'
      ? <Text modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle(islandPrimary)]}>Pause</Text>
      : expired
        ? <Text modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle(islandPrimary)]}>0:00</Text>
        : <Text date={endDate} dateStyle="timer" modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle(islandPrimary)]} />,
    minimal: <Text modifiers={[font({ weight: 'bold', size: 11 }), foregroundStyle(islandPrimary)]}>R</Text>,
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        <Text modifiers={[font({ weight: 'bold', size: 12 }), foregroundStyle(islandSecondary)]}>{heading}</Text>
        <Text modifiers={[font({ size: 14 }), foregroundStyle(islandPrimary)]}>{props.exerciseName}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={4}>
        {props.state === 'paused' || expired
          ? <Text modifiers={[font({ weight: 'bold', size: 22, design: 'rounded' }), foregroundStyle(islandPrimary)]}>{fixedTime}</Text>
          : <Text date={endDate} dateStyle="timer" modifiers={[font({ weight: 'bold', size: 22, design: 'rounded' }), foregroundStyle(islandPrimary)]} />}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(islandSecondary)]}>{props.nextSetNumber}/{props.targetSets}</Text>
      </VStack>
    ),
    expandedBottom: <Text modifiers={[font({ size: 14 }), foregroundStyle(islandSecondary)]}>Prochaine série · {props.nextSetNumber}/{props.targetSets}</Text>,
  };
};

export const RestLiveActivity = createLiveActivity<RestLiveActivityProps>('SportRestActivity', RestLiveActivityLayout);
