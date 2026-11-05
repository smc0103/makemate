import { useState } from 'react';
import type { Route } from './types';
import HomeScreen from './components/HomeScreen';
import GalleryScreen from './components/GalleryScreen';
import CharacterCreator from './components/CharacterCreator';
import PlaygroundScreen from './components/PlaygroundScreen';
import DecorateScreen from './components/DecorateScreen';

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });

  switch (route.name) {
    case 'home':
      return (
        <HomeScreen
          onCreate={() => setRoute({ name: 'create' })}
          onGallery={() => setRoute({ name: 'gallery' })}
        />
      );
    case 'gallery':
      return (
        <GalleryScreen
          onBack={() => setRoute({ name: 'home' })}
          onCreate={() => setRoute({ name: 'create' })}
          onPlay={(character) => setRoute({ name: 'play', character })}
          onEdit={(character) => setRoute({ name: 'edit', character })}
          onDecorate={(character) => setRoute({ name: 'decorate', character, back: 'gallery' })}
        />
      );
    case 'create':
      return (
        <CharacterCreator
          onCancel={() => setRoute({ name: 'home' })}
          onCreated={(character) => setRoute({ name: 'play', character })}
        />
      );
    case 'edit':
      return (
        <CharacterCreator
          key={route.character.id}
          editing={route.character}
          onCancel={() => setRoute({ name: 'gallery' })}
          onCreated={() => setRoute({ name: 'gallery' })}
        />
      );
    case 'play':
      return (
        <PlaygroundScreen
          key={route.character.id}
          character={route.character}
          onBack={() => setRoute({ name: 'gallery' })}
          onDecorate={(character, photo) => setRoute({ name: 'decorate', character, back: 'play', photo })}
        />
      );
    case 'decorate': {
      const { back } = route;
      return (
        <DecorateScreen
          key={route.character.id}
          character={route.character}
          initialPhoto={route.photo}
          onDone={(character) => setRoute(back === 'play' ? { name: 'play', character } : { name: 'gallery' })}
        />
      );
    }
  }
}
