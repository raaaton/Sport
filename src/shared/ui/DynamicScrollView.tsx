import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  View,
} from 'react-native';

import { keyboardDismissScrollOffset, keyboardOverlap, shouldEnableScroll, type KeyboardFrame, type ViewportFrame } from './dynamicScrollMetrics';

type DynamicScrollViewProps = Omit<ScrollViewProps, 'scrollEnabled' | 'children'> & {
  children?: React.ReactNode;
};

const CaptureScrollOffsetContext = createContext<() => void>(() => undefined);

/** Lets inputs capture the page position synchronously before the keyboard moves it. */
export function useCaptureDynamicScrollOffset(): () => void {
  return useContext(CaptureScrollOffsetContext);
}

/** A native ScrollView with measured overflow and keyboard-aware offset restoration. */
export function DynamicScrollView({ children, style, onLayout, onContentSizeChange, onScroll, onScrollBeginDrag, ...props }: DynamicScrollViewProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportFrame, setViewportFrame] = useState<ViewportFrame | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [keyboardFrame, setKeyboardFrame] = useState<KeyboardFrame | null>(null);
  const keyboardVisibleRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const offsetBeforeKeyboardRef = useRef<number | null>(null);
  const userDraggedWhileKeyboardRef = useRef(false);
  const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardCoveredHeight = keyboardOverlap(viewportFrame, keyboardFrame);
  const scrollEnabled = shouldEnableScroll(Math.max(0, viewportHeight - keyboardCoveredHeight), contentHeight);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvent, (event) => {
      const nextFrame = { top: event.endCoordinates.screenY, height: event.endCoordinates.height };
      if (keyboardOverlap(viewportFrame, nextFrame) > 0 && !keyboardVisibleRef.current && offsetBeforeKeyboardRef.current === null) {
        offsetBeforeKeyboardRef.current = scrollOffsetRef.current;
        userDraggedWhileKeyboardRef.current = false;
      }
      if (keyboardOverlap(viewportFrame, nextFrame) > 0) keyboardVisibleRef.current = true;
      setKeyboardFrame(nextFrame);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      setKeyboardFrame(null);
      const offset = keyboardDismissScrollOffset(offsetBeforeKeyboardRef.current, userDraggedWhileKeyboardRef.current);
      offsetBeforeKeyboardRef.current = null;
      userDraggedWhileKeyboardRef.current = false;
      if (offset !== null) {
        // `keyboardDidHide` can arrive before UIKit finishes its inset animation.
        if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current);
        restoreTimeoutRef.current = setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: offset, animated: false });
          restoreTimeoutRef.current = null;
        }, 120);
      }
    });
    return () => {
      show.remove();
      hide.remove();
      if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current);
    };
  }, [viewportFrame]);

  const captureOffsetBeforeKeyboard = () => {
    if (keyboardVisibleRef.current) return;
    offsetBeforeKeyboardRef.current = scrollOffsetRef.current;
    userDraggedWhileKeyboardRef.current = false;
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setViewportHeight(height);
    requestAnimationFrame(() => viewportRef.current?.measureInWindow((_x, y, _width, measuredHeight) => {
      setViewportFrame({ top: y, height: measuredHeight || height });
    }));
    onLayout?.(event);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  const handleScrollBeginDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (keyboardVisibleRef.current) userDraggedWhileKeyboardRef.current = true;
    onScrollBeginDrag?.(event);
  };

  const handleContentSizeChange = (width: number, height: number) => {
    setContentHeight(height);
    onContentSizeChange?.(width, height);
  };

  return (
    <CaptureScrollOffsetContext.Provider value={captureOffsetBeforeKeyboard}>
      <View ref={viewportRef} collapsable={false} style={[styles.viewport, style]} onLayout={handleLayout}>
        <ScrollView
          ref={scrollViewRef}
          {...props}
          style={styles.scroll}
          scrollEnabled={scrollEnabled}
          bounces={scrollEnabled && keyboardCoveredHeight <= 0}
          alwaysBounceVertical={false}
          overScrollMode={scrollEnabled ? 'auto' : 'never'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onContentSizeChange={handleContentSizeChange}
        >
          {children}
        </ScrollView>
      </View>
    </CaptureScrollOffsetContext.Provider>
  );
}

const styles = StyleSheet.create({ viewport: { flex: 1 }, scroll: { flex: 1 } });
