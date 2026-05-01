"use client";

import React from 'react';

export default function BackgroundAnimation() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" style={{ backgroundColor: '#020617' }}>
      {/* Dark gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 opacity-80" />
      
      {/* Floating Orbs */}
      <div 
        className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full opacity-30 mix-blend-screen"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, rgba(16,185,129,0) 70%)',
          filter: 'blur(80px)',
          animation: 'float-slow 20s infinite alternate ease-in-out'
        }}
      />
      <div 
        className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full opacity-20 mix-blend-screen"
        style={{
          background: 'radial-gradient(circle, rgba(5,150,105,0.4) 0%, rgba(5,150,105,0) 70%)',
          filter: 'blur(100px)',
          animation: 'float-slow-reverse 25s infinite alternate ease-in-out'
        }}
      />
      <div 
        className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full opacity-30 mix-blend-screen"
        style={{
          background: 'radial-gradient(circle, rgba(52,211,153,0.3) 0%, rgba(52,211,153,0) 70%)',
          filter: 'blur(60px)',
          animation: 'float-slow 15s infinite alternate ease-in-out'
        }}
      />
      
      {/* Noise overlay for texture */}
      <div 
        className="absolute inset-0 opacity-[0.04]" 
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' 
        }} 
      />
    </div>
  );
}
