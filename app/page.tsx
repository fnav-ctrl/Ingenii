export default function Home() {
  return <div dangerouslySetInnerHTML={{ __html: require('fs').readFileSync('./public/index.html', 'utf8') }} />;
}
