"""Static decoder safety tests. Archived 2025 forecast integration runs on GitHub CI."""
import pathlib,struct,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from ndfd_weather import weather_keys,categories,key_at_index,messages

def example(keys):
 raw=b"".join(k.encode("ascii")+b"\0" for k in keys)
 bits=7
 binary=[(char>>p)&1 for char in raw for p in range(6,-1,-1)]
 binary.extend([0]*((-len(binary))%8))
 data=bytes(int("".join(str(b) for b in binary[i:i+8]),2) for i in range(0,len(binary),8))
 body=bytes([1])+struct.pack(">H",1)+struct.pack(">I",len(raw))+struct.pack(">f",0)+struct.pack(">h",0)+bytes([7,1])+data
 section2=struct.pack(">I",len(body)+5)+bytes([2])+body
 # Complete synthetic section1 header only for grammar, decoder ignores other sections.
 total=16+len(section2)+4
 header=b"GRIB"+b"\0\0\0\x02"+total.to_bytes(8,"big")
 return header+section2+b"7777"

class TestWxTable(unittest.TestCase):
 def test_new_snow_and_blowing_snow_not_same(self):
  b=example(["<NoCov>:<NoWx>:<NoInten>:<NoVis>:","Lkly:SW:-:<NoVis>:^Patchy:BS:<NoInten>:<NoVis>:","Areas:BS:<NoInten>:<NoVis>:"])
  parsed=weather_keys(b)
  self.assertEqual(len(parsed),3)
  self.assertEqual(categories(parsed[0])[0],False)
  self.assertEqual(categories(parsed[1])[:2],(True,False))
  self.assertEqual(categories(parsed[2])[:2],(False,True))
  self.assertIsNone(key_at_index(parsed,9999))
  self.assertEqual(key_at_index(parsed,1),parsed[1])
 def test_reject_incomplete_wrong_section_and_unsupported_packing(self):
  b=example(["Sct:S:-:<NoVis>:"])
  self.assertEqual(list(messages(b)),[b])
  with self.assertRaises(ValueError):list(messages(b[:-4]))
  with self.assertRaises(ValueError):weather_keys(b[:19]+bytes([9])+b[20:])
  with self.assertRaises(ValueError):weather_keys(b.replace(b"7777",b"0000"))
if __name__=="__main__":unittest.main()
